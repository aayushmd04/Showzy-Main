from rest_framework import serializers
from .models import Event, EventArtist, EventPhoto, EventReview, EventSave
from apps.core.serializers import GenreSerializer
from apps.venues.serializers import VenueListSerializer
from apps.artists.serializers import ArtistListSerializer
from apps.tickets.serializers_light import TicketTierLightSerializer


class EventArtistSerializer(serializers.ModelSerializer):
    artist = ArtistListSerializer(read_only=True)

    class Meta:
        model = EventArtist
        fields = ["artist", "is_headliner", "performance_order", "set_duration_minutes"]


class EventPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventPhoto
        fields = ["id", "image", "caption", "is_primary", "sort_order"]


class EventReviewSerializer(serializers.ModelSerializer):
    reviewer_name = serializers.CharField(source="reviewer.name", read_only=True)
    reviewer_avatar = serializers.ImageField(source="reviewer.avatar", read_only=True)

    class Meta:
        model = EventReview
        fields = [
            "id", "reviewer_name", "reviewer_avatar", "rating",
            "comment", "is_verified_attendee", "created_at",
        ]
        read_only_fields = ["id", "is_verified_attendee", "created_at"]


class EventListSerializer(serializers.ModelSerializer):
    venue_name = serializers.CharField(source="venue.name", read_only=True)
    venue_area = serializers.CharField(source="venue.area.name", read_only=True, allow_null=True)
    city_name = serializers.CharField(source="venue.city.name", read_only=True)
    genres = GenreSerializer(many=True, read_only=True)
    min_price = serializers.SerializerMethodField()
    seats_left = serializers.SerializerMethodField()
    is_saved = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = [
            "id", "title", "title_kn", "tagline", "event_type", "status",
            "start_datetime", "end_datetime", "doors_open_at",
            "venue", "venue_name", "venue_area", "city_name",
            "genres", "poster_image", "is_free", "is_featured",
            "min_price", "seats_left", "is_saved",
            "is_seeking_artists", "performance_budget_min", "performance_budget_max",
        ]

    def get_min_price(self, obj):
        tiers = obj.ticket_tiers.filter(is_active=True, total_quantity__gt=0)
        if not tiers.exists():
            return 0
        free = tiers.filter(price=0)
        if free.exists():
            return 0
        return float(tiers.order_by("price").first().price)

    def get_seats_left(self, obj):
        from django.db.models import F, Sum
        result = obj.ticket_tiers.filter(is_active=True).aggregate(
            left=Sum(F("total_quantity") - F("sold_quantity") - F("reserved_quantity"))
        )
        return max(0, result["left"] or 0)

    def get_is_saved(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return EventSave.objects.filter(user=request.user, event=obj).exists()
        return False


class EventDetailSerializer(serializers.ModelSerializer):
    venue = VenueListSerializer(read_only=True)
    genres = GenreSerializer(many=True, read_only=True)
    event_artists = EventArtistSerializer(many=True, read_only=True)
    photos = EventPhotoSerializer(many=True, read_only=True)
    ticket_tiers = TicketTierLightSerializer(many=True, read_only=True)
    reviews = EventReviewSerializer(many=True, read_only=True)
    is_saved = serializers.SerializerMethodField()
    seats_left = serializers.SerializerMethodField()
    min_price = serializers.SerializerMethodField()
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)

    class Meta:
        model = Event
        exclude = ["is_deleted", "deleted_at", "artists"]

    def get_is_saved(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return EventSave.objects.filter(user=request.user, event=obj).exists()
        return False

    def get_seats_left(self, obj):
        from django.db.models import F, Sum
        result = obj.ticket_tiers.filter(is_active=True).aggregate(
            left=Sum(F("total_quantity") - F("sold_quantity") - F("reserved_quantity"))
        )
        return max(0, result["left"] or 0)

    def get_min_price(self, obj):
        tiers = obj.ticket_tiers.filter(is_active=True)
        if not tiers.exists():
            return 0
        free = tiers.filter(price=0)
        if free.exists():
            return 0
        first = tiers.order_by("price").first()
        return float(first.price) if first else 0


class EventCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        exclude = [
            "organizer", "is_deleted", "deleted_at", "published_at",
            "cancelled_at", "artists",
        ]
