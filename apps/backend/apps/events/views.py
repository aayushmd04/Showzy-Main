import logging

from django.utils import timezone
from rest_framework import generics, permissions, status, filters
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Event, EventStatus, EventSave, EventView, EventReview
from .serializers import (
    EventListSerializer, EventDetailSerializer,
    EventCreateUpdateSerializer, EventReviewSerializer,
)

logger = logging.getLogger(__name__)


def _notify(fn, *args, **kwargs):
    """Tell ticket holders about a change, without risking the change itself.

    Best-effort by design: the edit the organiser made has already been saved,
    and a failed notification must not undo it.
    """
    try:
        fn(*args, **kwargs)
    except Exception:
        logger.exception("Event notification %s failed", getattr(fn, "__name__", fn))


def _announce(event, before):
    from apps.notifications import dispatch

    if (
        before["status"] != EventStatus.CANCELLED
        and event.status == EventStatus.CANCELLED
    ):
        dispatch.event_cancelled(event)
        return

    dispatch.event_changed(
        event,
        time_changed=before["start_datetime"] != event.start_datetime,
        venue_changed=before["venue_id"] != event.venue_id,
    )


def _snapshot(event):
    return {
        "status": event.status,
        "start_datetime": event.start_datetime,
        "venue_id": event.venue_id,
    }


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
        mine = self.request.query_params.get("mine") == "true"

        if mine and self.request.user.is_authenticated:
            # Organizer view: all their events regardless of status
            qs = Event.objects.filter(
                organizer=self.request.user, is_deleted=False
            ).select_related("venue", "venue__city", "venue__area").prefetch_related(
                "genres", "ticket_tiers", "photos"
            )
        else:
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
        user = self.request.user
        # Any signed-in account used to be able to create an event — at someone
        # else's venue, and already published. Hosting is a venue owner's
        # job, at a venue they own (staff may act for any venue).
        if not (user.is_staff or getattr(user, "role", "") in ("venue_owner", "admin")):
            raise PermissionDenied("Only a venue account can create events.")
        venue = serializer.validated_data.get("venue")
        if venue is not None and not (user.is_staff or venue.owner_id == user.id):
            raise PermissionDenied("You can only create events at a venue you own.")
        # Always a draft: going live is the publish step, which checks there is
        # something to sell.
        serializer.save(organizer=user, created_by=user, status=EventStatus.DRAFT)


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
        # A draft is not public. Its id is in the host console URL, so without
        # this anyone holding the link could read an unannounced event.
        if instance.status == EventStatus.DRAFT and not (
            request.user.is_authenticated
            and (request.user.is_staff or instance.organizer_id == request.user.id)
        ):
            raise NotFound("Event not found.")
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

    def perform_update(self, serializer):
        # Read the old values off the unsaved instance — after save() they're gone.
        before = _snapshot(serializer.instance)
        serializer.save()
        event = serializer.instance
        event.refresh_from_db()
        _notify(_announce, event, before)

    def perform_destroy(self, instance):
        instance.soft_delete()
        # A deleted event is a cancelled event to anyone holding a ticket for it.
        from apps.notifications import dispatch

        _notify(dispatch.event_cancelled, instance)


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
    event = generics.get_object_or_404(Event, pk=pk, organizer=request.user, is_deleted=False)
    if event.status == EventStatus.CANCELLED:
        return Response({"detail": "A cancelled event can't be published."},
                        status=status.HTTP_400_BAD_REQUEST)
    if not event.ticket_tiers.filter(is_active=True).exists():
        return Response(
            {"detail": "Add a ticket tier before publishing — there would be nothing to sell."},
            status=status.HTTP_400_BAD_REQUEST)
    event.status = EventStatus.PUBLISHED
    event.published_at = timezone.now()
    event.save(update_fields=["status", "published_at"])
    return Response({"status": event.status})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_review(request, pk):
    """Leave — or correct — this user's one review of the event.

    ``EventReview`` is unique per (event, reviewer). Blindly creating a second
    one raised IntegrityError straight out of the view, which reached the
    client as a 500 and an HTML debug page. Someone fixing a typo in their own
    review is a normal thing to do, so re-posting updates the existing row
    instead of blowing up.
    """
    event = generics.get_object_or_404(Event, pk=pk, is_deleted=False)
    has_ticket = event.tickets.filter(
        user=request.user, status__in=["valid", "used"]
    ).exists()

    existing = EventReview.objects.filter(event=event, reviewer=request.user).first()
    serializer = EventReviewSerializer(
        existing, data=request.data, context={"request": request}
    )
    serializer.is_valid(raise_exception=True)
    serializer.save(
        event=event,
        reviewer=request.user,
        is_verified_attendee=has_ticket,
    )
    return Response(
        serializer.data,
        status=status.HTTP_200_OK if existing else status.HTTP_201_CREATED,
    )
