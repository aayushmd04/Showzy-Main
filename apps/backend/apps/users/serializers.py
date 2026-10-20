from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import OTPToken, UserDevice
from apps.core.urlfields import ForgivingURLField, IndianPhoneField, SocialHandleField

User = get_user_model()


class UserPublicSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "display_name", "avatar", "role", "is_verified"]


class UserProfileSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)

    class Meta:
        model = User
        fields = [
            "id", "email", "phone", "full_name", "display_name", "avatar",
            "bio", "website", "instagram", "role", "preferred_language",
            "city", "city_name", "is_verified", "created_at",
        ]
        read_only_fields = ["id", "email", "role", "is_verified", "date_joined"]


class UserUpdateSerializer(serializers.ModelSerializer):
    phone = IndianPhoneField()
    website = ForgivingURLField()
    instagram = SocialHandleField(platform="Instagram", hosts=("instagram.com",), max_length=60)

    class Meta:
        model = User
        fields = ["full_name", "display_name", "phone", "avatar", "bio",
                  "website", "instagram", "preferred_language", "city"]


#: Purposes the public (signed-out) endpoints may use. Deleting an account has
#: its own authenticated endpoint, so that code can't be requested or redeemed
#: here.
PUBLIC_OTP_PURPOSES = [
    c for c in OTPToken.Purpose.choices if c[0] != OTPToken.Purpose.DELETE_ACCOUNT
]


class OTPRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()
    # Cloudflare Turnstile token. Checked in the view, where the client IP is
    # at hand; optional here so a missing token is a clean 400, not a schema error.
    turnstile_token = serializers.CharField(required=False, allow_blank=True, write_only=True)
    purpose = serializers.ChoiceField(
        choices=PUBLIC_OTP_PURPOSES, default=OTPToken.Purpose.LOGIN
    )


class OTPVerifySerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField(min_length=4, max_length=8)
    purpose = serializers.ChoiceField(
        choices=PUBLIC_OTP_PURPOSES, default=OTPToken.Purpose.LOGIN
    )
    full_name = serializers.CharField(max_length=120, required=False)


class GoogleLoginSerializer(serializers.Serializer):
    credential = serializers.CharField(max_length=4096)


class UserDeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserDevice
        fields = ["id", "device_token", "platform", "device_model", "os_version", "app_version"]
        read_only_fields = ["id"]
