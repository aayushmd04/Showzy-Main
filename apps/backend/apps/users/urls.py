from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView, TokenBlacklistView
from . import views

urlpatterns = [
    path("auth/request-otp/", views.request_otp, name="auth-request-otp"),
    path("auth/verify-otp/", views.verify_otp, name="auth-verify-otp"),
    path("auth/refresh/", TokenRefreshView.as_view(), name="auth-token-refresh"),
    path("auth/logout/", TokenBlacklistView.as_view(), name="auth-logout"),
    path("auth/me/", views.MeView.as_view(), name="auth-me"),
    path("auth/set-role/", views.set_role, name="auth-set-role"),
    path("auth/me/export/", views.export_my_data, name="auth-me-export"),
    path("auth/me/deletion-check/", views.deletion_check, name="auth-deletion-check"),
    path("auth/me/deletion-code/", views.request_deletion_code, name="auth-deletion-code"),
    path("auth/consents/", views.consents, name="auth-consents"),
    path("auth/device/", views.register_device, name="auth-device"),
]
