from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({"status": "ok", "version": "1.0.0", "service": "naada-api"})


API_PREFIX = "api/v1/"

urlpatterns = [
    path("admin/", admin.site.urls),
    path(API_PREFIX + "health/", health_check, name="health"),
    path(API_PREFIX, include("apps.core.urls")),
    path(API_PREFIX, include("apps.users.urls")),
    path(API_PREFIX, include("apps.venues.urls")),
    path(API_PREFIX, include("apps.artists.urls")),
    path(API_PREFIX, include("apps.events.urls")),
    path(API_PREFIX, include("apps.tickets.urls")),
    path(API_PREFIX, include("apps.payments.urls")),
    path(API_PREFIX, include("apps.chat.urls")),
    path(API_PREFIX, include("apps.notifications.urls")),
    path(API_PREFIX, include("apps.bookings.urls")),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
