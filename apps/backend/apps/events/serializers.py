from rest_framework import serializers
from .models import Event, EventArtist, EventPhoto, EventReview, EventSave, EventStatus
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
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = EventReview
        fields = [
            "id", "reviewer_name", "reviewer_avatar", "rating",
            "comment", "is_verified_attendee", "is_mine", "created_at",
        ]
        read_only_fields = ["id", "is_verified_attendee", "created_at"]

    def get_is_mine(self, obj):
        """Lets a client show "your review" instead of offering a blank form.

        One review per person per event is a database constraint, so without
        this the UI has no way to tell whose row is whose — reviewer_name is
        not an identity.
        """
        request = self.context.get("request")
        return bool(
            request
            and request.user.is_authenticated
            and obj.reviewer_id == request.user.id
        )


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
    ticket_tiers = serializers.SerializerMethodField()
    reviews = EventReviewSerializer(many=True, read_only=True)
    is_saved = serializers.SerializerMethodField()
    seats_left = serializers.SerializerMethodField()
    min_price = serializers.SerializerMethodField()
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)

    class Meta:
        model = Event
        exclude = ["is_deleted", "deleted_at", "artists"]

    def get_ticket_tiers(self, obj):
        """Buyers see what they can buy; the organiser also sees what they switched off.

        A tier the host deactivated or hid used to be listed on the public page,
        where picking it ended in a "not found" at checkout.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None)
        tiers = obj.ticket_tiers.all()
        if not (user and user.is_authenticated
                and (user.is_staff or obj.organizer_id == user.id)):
            tiers = [t for t in tiers if t.is_active and t.is_visible]
        return TicketTierLightSerializer(tiers, many=True, context=self.context).data

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
    def validate_status(self, value):
        # Going live has its own step (`/publish/`), which checks there is a
        # ticket to sell; a PATCH must not be a way around it.
        if value == EventStatus.PUBLISHED and (
            self.instance is None or self.instance.status != EventStatus.PUBLISHED
        ):
            raise serializers.ValidationError("Use the publish step to put an event on sale.")
        return value

    class Meta:
        model = Event
        exclude = [
            "organizer", "is_deleted", "deleted_at", "published_at",
            "cancelled_at", "artists",
        ]
