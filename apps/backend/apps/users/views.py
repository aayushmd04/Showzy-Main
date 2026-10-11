import logging
import random
import string
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings as django_settings
from rest_framework import status, generics, permissions
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, SimpleRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from datetime import timedelta

from . import privacy
from .models import ConsentRecord, OTPToken, UserDevice, UserRole

logger = logging.getLogger(__name__)
from .serializers import (
    OTPRequestSerializer, OTPVerifySerializer,
    UserProfileSerializer, UserUpdateSerializer, UserDeviceSerializer
)

User = get_user_model()


class OTPRateThrottle(AnonRateThrottle):
    """Caps how many sign-in codes one *caller* can ask for. Keyed on IP."""

    scope = "otp"


class OTPEmailThrottle(SimpleRateThrottle):
    """Caps how many sign-in codes one *address* can be sent.

    The IP throttle above protects us from one attacker; this protects a user
    from many. Anyone willing to rotate IPs — a phone toggling airplane mode is
    enough — could otherwise pour unlimited "your Naada code is…" mail into
    somebody's inbox, and burn the sending quota on the free email tier while
    they were at it.

    Keyed on the submitted address, so the two throttles compose: a flood has
    to get past both the per-IP and the per-recipient budget.
    """

    scope = "otp_email"

    def get_cache_key(self, request, view):
        email = (request.data or {}).get("email") if hasattr(request, "data") else None
        if not isinstance(email, str) or not email.strip():
            # Nothing to key on — let the serializer reject it as a bad request
            # rather than spending this caller's budget on a malformed body.
            return None
        return self.cache_format % {"scope": self.scope, "ident": email.strip().lower()}


def get_client_ip(request):
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    return x_forwarded.split(",")[0] if x_forwarded else request.META.get("REMOTE_ADDR")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([OTPRateThrottle, OTPEmailThrottle])
def request_otp(request):
    serializer = OTPRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].lower()
    purpose = serializer.validated_data["purpose"]

    # Invalidate any existing unused OTPs for this email/purpose
    OTPToken.objects.filter(email=email, purpose=purpose, is_used=False).update(is_used=True)

    raw_otp = OTPToken.generate_otp()
    otp_hash = OTPToken.hash_otp(raw_otp)
    expiry = timezone.now() + timedelta(minutes=getattr(django_settings, "OTP_EXPIRY_MINUTES", 10))

    OTPToken.objects.create(
        email=email,
        otp_hash=otp_hash,
        purpose=purpose,
        expires_at=expiry,
        ip_address=get_client_ip(request),
    )

    # Send email (console backend locally, SMTP in prod)
    # The code stays out of the subject: subject lines show in lock-screen
    # previews and are retained in mail-relay logs far more widely than bodies.
    expiry_minutes = getattr(django_settings, "OTP_EXPIRY_MINUTES", 10)
    send_mail(
        subject="Your Naada sign-in code",
        message=f"""Hi,

Your Naada one-time password is: {raw_otp}

It expires in {expiry_minutes} minutes. Do not share this with anyone.

If you didn't ask to sign in, you can ignore this email.

— Naada Team""",
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )

    resp = {"detail": f"OTP sent to {email}. Check your email."}
    # Echo the OTP only where a setting explicitly allows it (local dev). Keying
    # this off DEBUG alone meant one misconfigured deploy would hand any caller
    # a valid OTP for any email address; production forces this to False.
    if getattr(django_settings, "OTP_DEBUG_RESPONSE", False):
        resp["debug_otp"] = raw_otp
    return Response(resp, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def verify_otp(request):
    serializer = OTPVerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data["email"].lower()
    raw_otp = serializer.validated_data["otp"]
    purpose = serializer.validated_data["purpose"]
    full_name = serializer.validated_data.get("full_name", "")

    # Find the latest unused, unexpired token for this email
    token = OTPToken.objects.filter(
        email=email, purpose=purpose, is_used=False
    ).order_by("-created_at").first()

    if not token or not token.verify(raw_otp):
        return Response(
            {"detail": "Invalid or expired OTP."},
            status=status.HTTP_400_BAD_REQUEST
        )

    # Get or create user
    user, created = User.objects.get_or_create(
        email=email,
        defaults={"full_name": full_name or email.split("@")[0], "is_verified": True}
    )
    if not user.is_verified:
        user.is_verified = True
        user.save(update_fields=["is_verified"])

    # Update last login metadata
    user.last_login_ip = get_client_ip(request)
    user.last_login_device = request.META.get("HTTP_USER_AGENT", "")[:200]
    user.save(update_fields=["last_login_ip", "last_login_device"])

    refresh = RefreshToken.for_user(user)
    user_data = UserProfileSerializer(user).data
    user_data["is_new_user"] = created
    return Response({
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "user": user_data,
        "created": created,
    }, status=status.HTTP_200_OK)


class MeView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return UserUpdateSerializer
        return UserProfileSerializer

    def get_object(self):
        return self.request.user

    def destroy(self, request, *args, **kwargs):
        """Erasure request under the DPDP Act, 2023.

        Irreversible, so it is gated three ways: nothing may be pending that
        other people are relying on (see `privacy.deletion_report`), the person
        must confirm they understand they will lose upcoming tickets, and they
        must prove they still control the inbox with a fresh one-time code —
        a stolen or left-open session alone can't wipe an account.
        """
        user = request.user
        report = privacy.deletion_report(user)
        if report["blockers"]:
            return Response(
                {"detail": "Some things need finishing before this account can be deleted.", **report},
                status=status.HTTP_409_CONFLICT,
            )
        if report["warnings"] and not request.data.get("acknowledge_losses"):
            return Response(
                {"detail": "Please confirm you understand what you will lose.",
                 "needs_acknowledgement": True, **report},
                status=status.HTTP_409_CONFLICT,
            )

        code = str(request.data.get("code") or "").strip()
        token = OTPToken.objects.filter(
            email__iexact=user.email, purpose=OTPToken.Purpose.DELETE_ACCOUNT, is_used=False
        ).order_by("-created_at").first()
        if not code or not token or not token.verify(code):
            return Response(
                {"detail": "That code is wrong or has expired. Ask for a new one."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        privacy.erase_account(user)
        return Response(
            {"detail": "Your account has been deleted."},
            status=status.HTTP_200_OK,
        )


class DeletionCodeThrottle(OTPEmailThrottle):
    """One code per hour-budget per signed-in account (keyed on the user)."""

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": f"del-{request.user.pk}"}


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def deletion_check(request):
    """What deleting this account would erase and keep, and what blocks it."""
    return Response(privacy.deletion_report(request.user))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@throttle_classes([DeletionCodeThrottle])
def request_deletion_code(request):
    """Email a fresh one-time code to the signed-in user, to confirm deletion."""
    user = request.user
    OTPToken.objects.filter(
        email__iexact=user.email, purpose=OTPToken.Purpose.DELETE_ACCOUNT, is_used=False
    ).update(is_used=True)
    raw_otp = OTPToken.generate_otp()
    expiry_minutes = getattr(django_settings, "OTP_EXPIRY_MINUTES", 10)
    OTPToken.objects.create(
        email=user.email.lower(),
        otp_hash=OTPToken.hash_otp(raw_otp),
        purpose=OTPToken.Purpose.DELETE_ACCOUNT,
        expires_at=timezone.now() + timedelta(minutes=expiry_minutes),
        ip_address=get_client_ip(request),
    )
    send_mail(
        subject="Confirm deleting your Naada account",
        message=f"""Hi,

Someone asked to permanently delete your Naada account.

To confirm, enter this code: {raw_otp}

It expires in {expiry_minutes} minutes. If this wasn't you, ignore this email —
nothing will be deleted — and consider who else has access to your inbox.

— Naada Team""",
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )
    resp = {"detail": "We've emailed you a code."}
    if getattr(django_settings, "OTP_DEBUG_RESPONSE", False):
        resp["debug_otp"] = raw_otp
    return Response(resp)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def consents(request):
    """The person's consent log. GET = current position per kind; POST appends.

    Append-only: withdrawing consent is a new row with `granted=false`, never an
    edit, so the history stays an honest record.
    """
    user = request.user
    if request.method == "POST":
        kind = request.data.get("kind")
        version = str(request.data.get("version") or "")[:20]
        if kind not in ConsentRecord.Kind.values or not version:
            return Response({"detail": "kind and version are required."}, status=status.HTTP_400_BAD_REQUEST)
        granted = bool(request.data.get("granted", True))
        latest = user.consents.filter(kind=kind).first()
        if not (latest and latest.version == version and latest.granted == granted):
            ConsentRecord.objects.create(
                user=user, kind=kind, version=version, granted=granted,
                source=str(request.data.get("source") or "")[:30],
            )
    current = {}
    for row in user.consents.all():  # newest first, so first seen per kind wins
        current.setdefault(row.kind, {
            "version": row.version, "granted": row.granted,
            "source": row.source, "at": row.created_at,
        })
    return Response(current)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def set_role(request):
    """A user chooses (or later changes) their own role.

    Deliberately its own endpoint rather than a field on `UserUpdateSerializer`
    — that serializer backs the general `PATCH /auth/me/` profile edit, and a
    self-service `role` field there would let any signed-in user PATCH their
    way to `admin`. This is the one place a role change can happen at all, and
    it only ever accepts the roles a person can pick for themselves.

    Selecting the artist role has to actually make the user bookable — setting
    `User.role` alone leaves them invisible to search and to hosts, so this
    also creates the `Artist` row a bookable account needs.
    """
    new_role = request.data.get("role")
    selectable = {UserRole.ATTENDEE, UserRole.ARTIST, UserRole.VENUE_OWNER}
    if new_role not in selectable:
        return Response(
            {"detail": "role must be one of: attendee, artist, venue_owner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    user.role = new_role
    user.save(update_fields=["role"])

    if user.role == UserRole.ARTIST:
        from apps.artists.models import Artist

        Artist.objects.get_or_create(
            user=user,
            defaults={
                "stage_name": user.display_name or user.full_name or user.email.split("@")[0],
                "bio": user.bio or "",
            },
        )

    return Response(UserProfileSerializer(user).data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def export_my_data(request):
    """Everything we hold on the requesting user, as a JSON download.

    The access right under the DPDP Act, 2023 — see `privacy.export_data`.
    """
    response = Response(privacy.export_data(request.user))
    response["Content-Disposition"] = 'attachment; filename="naada-my-data.json"'
    return response


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def register_device(request):
    serializer = UserDeviceSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    device, _ = UserDevice.objects.update_or_create(
        user=request.user,
        device_token=serializer.validated_data["device_token"],
        defaults={**serializer.validated_data, "is_active": True}
    )
    return Response(UserDeviceSerializer(device).data, status=status.HTTP_200_OK)
