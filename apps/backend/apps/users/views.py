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
from datetime import timedelta

from .models import OTPToken, UserDevice
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
    send_mail(
        subject=f"Your Naada OTP: {raw_otp}",
        message=f"""Hi,

Your Naada one-time password is: {raw_otp}

It expires in 10 minutes. Do not share this with anyone.

— Naada Team""",
        from_email=django_settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
        fail_silently=False,
    )

    resp = {"detail": f"OTP sent to {email}. Check your email."}
    # In DEBUG mode, include the OTP in the response so developers can test without email SMTP
    if django_settings.DEBUG:
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


class MeView(generics.RetrieveUpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return UserUpdateSerializer
        return UserProfileSerializer

    def get_object(self):
        return self.request.user


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
