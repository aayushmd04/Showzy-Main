import logging

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.core.cache import caches
from django.db import connections
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

logger = logging.getLogger(__name__)

SERVICE_VERSION = "1.0.0"


def _check_database():
    """Round-trip a trivial query so a dead/unreachable DB is actually detected."""
    conn = connections["default"]
    with conn.cursor() as cursor:
        cursor.execute("SELECT 1")
        cursor.fetchone()


def _check_cache():
    """Only meaningful when a real (non local-memory) cache backend is configured."""
    cache = caches["default"]
    backend = settings.CACHES["default"]["BACKEND"]
    if "locmem" in backend or "dummy" in backend:
        return "skipped"
    cache.set("naada:healthcheck", "1", 10)
    if cache.get("naada:healthcheck") != "1":
        raise RuntimeError("cache write/read mismatch")
    return "ok"


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
@throttle_classes([])  # a load balancer polls this every few seconds
def health_check(request):
    """Real liveness probe: 200 only when every checked component responds.

    Returns 503 with per-component detail otherwise, so an LB stops routing
    traffic to a node whose database has gone away.
    """
    components = {}
    healthy = True

    try:
        _check_database()
        components["database"] = "ok"
    except Exception as exc:
        healthy = False
        components["database"] = f"error: {exc.__class__.__name__}"
        logger.error("Health check: database unreachable: %s", exc)

    try:
        components["cache"] = _check_cache()
    except Exception as exc:
        healthy = False
        components["cache"] = f"error: {exc.__class__.__name__}"
        logger.error("Health check: cache unreachable: %s", exc)

    payload = {
        "status": "ok" if healthy else "unhealthy",
        "version": SERVICE_VERSION,
        "service": "naada-api",
        "components": components,
    }
    return Response(
        payload,
        status=status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE,
    )


API_PREFIX = "api/v1/"

urlpatterns = [
    path("admin/", admin.site.urls),
    path(API_PREFIX + "health/", health_check, name="health"),
    # OpenAPI schema + browsable docs
    path(API_PREFIX + "schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        API_PREFIX + "docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="docs",
    ),
    path(
        API_PREFIX + "redoc/",
        SpectacularRedocView.as_view(url_name="schema"),
        name="redoc",
    ),
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
