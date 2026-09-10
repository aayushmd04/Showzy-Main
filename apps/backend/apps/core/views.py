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
    """Sitemap of published events, pointing at the frontend.

    Search engines need to reach the public site, not the API, so every URL is
    built from FRONTEND_URL rather than this host. robots.txt on the frontend
    declares this file's location.
    """
    from django.utils import timezone
    from apps.events.models import Event, EventStatus

    base = settings.FRONTEND_URL.rstrip("/")
    urls = [
        (f"{base}/", "daily", "1.0"),
        (f"{base}/artists", "weekly", "0.7"),
        (f"{base}/venues", "weekly", "0.7"),
        (f"{base}/how-it-works", "monthly", "0.4"),
    ]

    entries = "".join(
        f"<url><loc>{loc}</loc><changefreq>{freq}</changefreq>"
        f"<priority>{pri}</priority></url>"
        for loc, freq, pri in urls
    )

    events = (
        Event.objects.filter(
            status=EventStatus.PUBLISHED,
            is_deleted=False,
            start_datetime__gte=timezone.now(),
        )
        .only("id", "updated_at")
        .order_by("start_datetime")[:2000]
    )
    for event in events:
        entries += (
            f"<url><loc>{base}/e/{event.id}</loc>"
            f"<lastmod>{event.updated_at.date().isoformat()}</lastmod>"
            f"<changefreq>daily</changefreq><priority>0.9</priority></url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{entries}</urlset>"
    )
    return Response(xml, content_type="application/xml")
