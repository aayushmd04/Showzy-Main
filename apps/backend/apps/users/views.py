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
from rest_framework.throttling import AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from datetime import timedelta

from .models import OTPToken, UserDevice, UserRole

logger = logging.getLogger(__name__)
from .serializers import (
    OTPRequestSerializer, OTPVerifySerializer,
    UserProfileSerializer, UserUpdateSerializer, UserDeviceSerializer
)

User = get_user_model()


class OTPRateThrottle(AnonRateThrottle):
    scope = "otp"


def get_client_ip(request):
    x_forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    return x_forwarded.split(",")[0] if x_forwarded else request.META.get("REMOTE_ADDR")


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
@throttle_classes([OTPRateThrottle])
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

        Soft delete rather than a hard one: ticket and payment rows must survive
        for tax and dispute purposes. Identifying fields are scrubbed and the
        email is released so the address can be reused, while the row that
        financial records point at stays intact.
        """
        user = request.user
        stamp = timezone.now().strftime("%Y%m%d%H%M%S")

        user.email = f"deleted+{user.pk}.{stamp}@naada.invalid"
        user.phone = None
        user.full_name = "Deleted user"
        user.display_name = ""
        user.bio = ""
        user.website = ""
        user.instagram = ""
        user.avatar = None
        user.is_active = False
        user.save(update_fields=[
            "email", "phone", "full_name", "display_name", "bio",
            "website", "instagram", "avatar", "is_active",
        ])
        user.soft_delete()

        # Drop push targets and sign every device out.
        UserDevice.objects.filter(user=user).delete()
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)

        return Response(
            {"detail": "Your account has been deleted."},
            status=status.HTTP_200_OK,
        )


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
    """Everything we hold on the requesting user, as JSON.

    The access right under the DPDP Act, 2023. Deliberately assembled by hand
    rather than dumped from the ORM so that adding a model does not silently
    start leaking a new field.
    """
    user = request.user
    data = {
        "exported_at": timezone.now().isoformat(),
        "account": UserProfileSerializer(user).data,
        "tickets": [],
        "ticket_orders": [],
        "saved_events": [],
    }

    try:
        from apps.tickets.models import Ticket, Order

        data["tickets"] = [
            {
                "ticket_number": t.ticket_number,
                "event": t.event.title,
                "tier": t.tier.name if t.tier else None,
                "status": t.status,
                "checked_in_at": t.checked_in_at.isoformat() if t.checked_in_at else None,
                "purchased_at": t.created_at.isoformat(),
            }
            for t in Ticket.objects.filter(user=user).select_related("event", "tier")
        ]
        data["ticket_orders"] = [
            {
                "id": str(o.id),
                "event": o.event.title,
                "status": o.status,
                "total_amount": str(o.total_amount),
                "created_at": o.created_at.isoformat(),
            }
            for o in Order.objects.filter(user=user).select_related("event")
        ]
    except Exception:  # pragma: no cover - export must never 500
        logger.exception("Partial data export for user %s", user.pk)

    try:
        from apps.events.models import EventSave

        data["saved_events"] = [
            {"event": s.event.title, "saved_at": s.created_at.isoformat()}
            for s in EventSave.objects.filter(user=user).select_related("event")
        ]
    except Exception:  # pragma: no cover
        logger.exception("Saved-events export failed for user %s", user.pk)

    response = Response(data)
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
