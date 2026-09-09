from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User, OTPToken, UserDevice

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ["email", "full_name", "role", "is_verified", "is_active", "created_at"]
    list_filter = ["role", "is_verified", "is_active"]
    search_fields = ["email", "full_name", "phone"]
    ordering = ["-created_at"]
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal", {"fields": ("full_name", "display_name", "phone", "avatar", "bio", "city")}),
        ("Role & Flags", {"fields": ("role", "preferred_language", "is_verified", "is_active", "is_staff", "is_superuser")}),
        ("Security", {"fields": ("last_login_ip",)}),
        ("Groups", {"fields": ("groups", "user_permissions")}),
    )
    add_fieldsets = (
        (None, {"fields": ("email", "full_name", "role", "password1", "password2")}),
    )
    filter_horizontal = ["groups", "user_permissions"]

@admin.register(OTPToken)
class OTPTokenAdmin(admin.ModelAdmin):
    list_display = ["email", "purpose", "is_used", "attempt_count", "expires_at", "created_at"]
    list_filter = ["purpose", "is_used"]
    search_fields = ["email"]
    readonly_fields = ["otp_hash"]

@admin.register(UserDevice)
class UserDeviceAdmin(admin.ModelAdmin):
    list_display = ["user", "platform", "device_model", "last_seen", "is_active"]
