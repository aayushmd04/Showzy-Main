import logging

from django.contrib import admin
from django.http import Http404
from django.urls import path, include, re_path
from django.views.static import serve as serve_media
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
    """Liveness probe for the platform's load balancer.

    Two rules, both learned from an outage:

    * It answers 503 only when the **database** is unreachable. That is the one
      thing the API cannot serve a request without. The cache is a convenience
      (rate-limit counters, a lock or two): when Redis is down or over its quota
      the API carries on with a local fallback, so a dead cache must never make
      the platform declare the whole service unhealthy and stop routing to it.

    * It does **not touch Redis** unless asked (`?deep=1`). Render polls this
      every few seconds; two Redis commands per poll is roughly half a million a
      month, which is the entire free quota of a hosted Redis on its own.
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

    if request.query_params.get("deep") == "1":
        try:
            components["cache"] = _check_cache()
        except Exception as exc:
            # Reported, never fatal.
            components["cache"] = f"degraded: {exc.__class__.__name__}"
            logger.warning("Health check: cache unreachable (serving without it): %s", exc)

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

# `static()` above does nothing once DEBUG is off, so in production every photo
# an artist or venue uploaded was saved to disk and then answered 404 — the
# image showed as a broken placeholder everywhere it appeared. Serve uploads
# from disk whenever they live on this server (a MEDIA_URL that is a path, not
# a bucket's address). Behind S3 or a CDN the files never touch this server, so
# there is nothing to serve.
if not settings.DEBUG and settings.MEDIA_URL.startswith("/"):
    urlpatterns += [
        re_path(
            r"^%s(?P<path>.*)$" % settings.MEDIA_URL.lstrip("/"),
            serve_media,
            {"document_root": settings.MEDIA_ROOT},
        )
    ]



def _qr_not_served(request, path=""):
    raise Http404


# Ticket QR codes are entry credentials and are rendered per request for the
# holder (see Ticket.qr_png_bytes). Old files from before that change are deleted
# by tickets migration 0008; this refuses to serve any that survive. Inserted
# first so it wins over both media routes above.
if settings.MEDIA_URL.startswith("/"):
    urlpatterns.insert(
        0,
        re_path(r"^%stickets/qr/(?P<path>.*)$" % settings.MEDIA_URL.lstrip("/"), _qr_not_served),
    )
