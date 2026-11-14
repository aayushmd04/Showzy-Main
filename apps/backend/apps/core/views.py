from django.conf import settings
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.renderers import StaticHTMLRenderer
from rest_framework.response import Response
from rest_framework import generics, permissions
from .models import City, Area, Genre
from .serializers import CitySerializer, AreaSerializer, GenreSerializer


class CityListView(generics.ListAPIView):
    queryset = City.objects.filter(is_active=True)
    serializer_class = CitySerializer
    permission_classes = [permissions.AllowAny]


class AreaListView(generics.ListAPIView):
    serializer_class = AreaSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        qs = Area.objects.filter(is_active=True).select_related("city")
        city = self.request.query_params.get("city")
        if city:
            qs = qs.filter(city__slug=city)
        return qs


class GenreListView(generics.ListAPIView):
    queryset = Genre.objects.filter(is_active=True)
    serializer_class = GenreSerializer
    permission_classes = [permissions.AllowAny]


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
@renderer_classes([StaticHTMLRenderer])
def sitemap_xml(request):
    """Sitemap of everything public worth searching for, pointing at the frontend.

    Search engines need to reach the public site, not the API, so every URL is
    built from FRONTEND_URL rather than this host. robots.txt on the frontend
    declares this file's location (which is what permits a sitemap on another
    host to list the site's pages).

    Listed: the home pages, every published event (upcoming and the last three
    months, so shared links to a recent gig stay findable), every active artist
    and venue, and the art-form pages. Not listed: anything private, drafts,
    search results.
    """
    from datetime import timedelta
    from urllib.parse import quote
    from xml.sax.saxutils import escape

    from django.utils import timezone
    from apps.artists.models import Artist
    from apps.core.models import Genre
    from apps.events.models import Event, EventStatus
    from apps.venues.models import Venue

    base = settings.FRONTEND_URL.rstrip("/")
    entries = []

    def add(path, freq, priority, lastmod=None):
        loc = escape(f"{base}{path}")
        mod = f"<lastmod>{lastmod.date().isoformat()}</lastmod>" if lastmod else ""
        entries.append(f"<url><loc>{loc}</loc>{mod}<changefreq>{freq}</changefreq><priority>{priority}</priority></url>")

    for path, freq, pri in (
        ("/", "daily", "1.0"), ("/whats-on", "daily", "0.9"), ("/explore", "daily", "0.8"),
        ("/artists", "weekly", "0.7"), ("/venues", "weekly", "0.7"),
        ("/how-it-works", "monthly", "0.4"), ("/contact", "yearly", "0.3"),
    ):
        add(path, freq, pri)

    for cat in ("music", "drama", "dance", "comedy", "art"):
        add(f"/explore?category={cat}", "daily", "0.7")
    for name in Genre.objects.filter(is_active=True).values_list("name", flat=True):
        add(f"/explore?genre={quote(name)}", "daily", "0.6")

    cutoff = timezone.now() - timedelta(days=90)
    for event in (
        Event.objects.filter(status__in=[EventStatus.PUBLISHED, EventStatus.SOLD_OUT, EventStatus.PAST],
                             is_deleted=False, end_datetime__gte=cutoff)
        .only("id", "updated_at").order_by("start_datetime")[:20000]
    ):
        add(f"/e/{event.id}", "daily", "0.9", event.updated_at)

    for artist in Artist.objects.filter(is_active=True, is_deleted=False).only("id", "updated_at")[:10000]:
        add(f"/a/{artist.id}", "weekly", "0.6", artist.updated_at)

    for venue in Venue.objects.filter(is_active=True, is_deleted=False).only("slug", "updated_at")[:10000]:
        add(f"/v/{venue.slug}", "weekly", "0.6", venue.updated_at)

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(entries)
        + "</urlset>"
    )
    response = Response(xml, content_type="application/xml")
    # Crawlers fetch this rarely; let a CDN or the browser reuse it for an hour.
    response["Cache-Control"] = "public, max-age=3600"
    return response


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def site_config(request):
    """Operator details the public pages need — legal entity, contact, tax.

    These live in the environment rather than in the frontend source so the
    founder can fill them in at deploy time without editing code or triggering
    a rebuild. The policy pages read `is_complete` to decide whether to warn
    that they are not ready to publish.
    """
    entity = {
        "name": getattr(settings, "SITE_NAME", "Showzy"),
        "legal_name": getattr(settings, "LEGAL_ENTITY_NAME", ""),
        "address": getattr(settings, "LEGAL_ENTITY_ADDRESS", ""),
        "email": getattr(settings, "SUPPORT_EMAIL", ""),
        "phone": getattr(settings, "SUPPORT_PHONE", ""),
        "gstin": getattr(settings, "GSTIN", ""),
        "grievance_officer": getattr(settings, "GRIEVANCE_OFFICER", ""),
        "policies_updated": getattr(settings, "POLICIES_UPDATED", ""),
    }
    required = ["legal_name", "address", "email", "phone", "grievance_officer"]
    missing = [k for k in required if not entity.get(k)]

    return Response({
        **entity,
        "missing": missing,
        "is_complete": not missing,
        # Shown on the refund policy so it matches what is actually charged.
        "booking_fee": getattr(settings, "CONVENIENCE_FEE", 0),
        "gst_configured": bool(
            getattr(settings, "GST_RATE_FEE", 0) or getattr(settings, "GST_RATE_TICKET", 0)
        ),
    })
