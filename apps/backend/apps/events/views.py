from django.utils import timezone
from rest_framework import generics, permissions, status, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Event, EventStatus, EventSave, EventView, EventReview
from .serializers import (
    EventListSerializer, EventDetailSerializer,
    EventCreateUpdateSerializer, EventReviewSerializer,
)


class IsOrganizerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.organizer == request.user


class EventListView(generics.ListAPIView):
    serializer_class = EventListSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    search_fields = ["title", "title_kn", "venue__name", "venue__area__name"]
    ordering_fields = ["start_datetime", "created_at"]
    ordering = ["start_datetime"]

    def get_queryset(self):
        qs = Event.objects.filter(
            status=EventStatus.PUBLISHED, is_deleted=False
        ).select_related("venue", "venue__city", "venue__area").prefetch_related(
            "genres", "ticket_tiers", "photos"
        )
        city = self.request.query_params.get("city")
        genre = self.request.query_params.get("genre")
        date = self.request.query_params.get("date")
        is_free = self.request.query_params.get("free")
        featured = self.request.query_params.get("featured")
        upcoming = self.request.query_params.get("upcoming")
        tonight = self.request.query_params.get("tonight")

        if city:
            qs = qs.filter(venue__city__slug=city)
        if genre:
            qs = qs.filter(genres__slug=genre)
        if date:
            qs = qs.filter(start_datetime__date=date)
        if is_free == "true":
            qs = qs.filter(is_free=True)
        if featured == "true":
            qs = qs.filter(is_featured=True)
        if upcoming == "true":
            qs = qs.filter(start_datetime__gte=timezone.now())
        if tonight == "true":
            today = timezone.now().date()
            qs = qs.filter(start_datetime__date=today)

        return qs.distinct()


class EventCreateView(generics.CreateAPIView):
    serializer_class = EventCreateUpdateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(organizer=self.request.user, created_by=self.request.user)


class EventDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Event.objects.filter(is_deleted=False).prefetch_related(
        "genres", "event_artists__artist__genres", "event_artists__artist__photos",
        "photos", "ticket_tiers", "reviews__reviewer",
    ).select_related("venue", "venue__city", "venue__area", "organizer")
    permission_classes = [IsOrganizerOrReadOnly]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return EventCreateUpdateSerializer
        return EventDetailSerializer

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        # Record view
        EventView.objects.create(
            event=instance,
            user=request.user if request.user.is_authenticated else None,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
            referrer=request.META.get("HTTP_REFERER", "")[:200],
        )
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def perform_destroy(self, instance):
        instance.soft_delete()


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def save_event(request, pk):
    event = generics.get_object_or_404(Event, pk=pk, is_deleted=False)
    if request.method == "POST":
        EventSave.objects.get_or_create(user=request.user, event=event)
        return Response({"saved": True})
    EventSave.objects.filter(user=request.user, event=event).delete()
    return Response({"saved": False})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def saved_events(request):
    saves = EventSave.objects.filter(user=request.user).select_related(
        "event__venue", "event__venue__city"
    ).prefetch_related("event__genres", "event__ticket_tiers")
    events = [s.event for s in saves]
    serializer = EventListSerializer(events, many=True, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def publish_event(request, pk):
    event = generics.get_object_or_404(Event, pk=pk, organizer=request.user)
    event.status = EventStatus.PUBLISHED
    event.published_at = timezone.now()
    event.save(update_fields=["status", "published_at"])
    return Response({"status": event.status})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_review(request, pk):
    event = generics.get_object_or_404(Event, pk=pk, is_deleted=False)
    has_ticket = event.tickets.filter(user=request.user, status="valid").exists() or \
                 event.tickets.filter(user=request.user, status="used").exists()
    serializer = EventReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(
        event=event,
        reviewer=request.user,
        is_verified_attendee=has_ticket,
    )
    return Response(serializer.data, status=status.HTTP_201_CREATED)
