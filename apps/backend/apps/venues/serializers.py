from rest_framework import serializers
from .models import Venue, VenuePhoto, VenueHours, VenueOperatorAccess, VenueFollower
from apps.core.serializers import CitySerializer, AreaSerializer
from apps.core import privacy
from apps.core.urlfields import ForgivingURLField, IndianPhoneField, SocialHandleField
from apps.core.payout_fields import PayoutFieldsMixin, PAYOUT_READ_ONLY_FIELDS, PayoutDetailReadMixin


class VenuePhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = VenuePhoto
        fields = ["id", "image", "caption", "is_primary", "sort_order"]


class VenueHoursSerializer(serializers.ModelSerializer):
    class Meta:
        model = VenueHours
        fields = ["day_of_week", "open_time", "close_time", "is_closed", "notes"]


class VenueListSerializer(serializers.ModelSerializer):
    city_name = serializers.CharField(source="city.name", read_only=True)
    area_name = serializers.CharField(source="area.name", read_only=True, allow_null=True)
    primary_photo = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        fields = [
            "id", "name", "name_kn", "slug", "tagline",
            "city", "city_name", "area_name", "capacity",
            "stage_type", "is_verified", "is_featured",
            "primary_photo", "lat", "lng",
            # Where guests go. Public by nature: a venue on a ticketing site is
            # a place people are meant to find.
            "address_line1", "address_line2", "pincode", "google_maps_url",
            # The host's floor-plan editor loads from ?mine=true and needs the
            # stored plan, not just the summary fields.
            "layout",
        ]

    def get_primary_photo(self, obj):
        photo = obj.photos.filter(is_primary=True).first() or obj.photos.first()
        if photo:
            request = self.context.get("request")
            return request.build_absolute_uri(photo.image.url) if request and photo.image else None
        return None

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        owner = privacy.is_staff(user) or (
            privacy._authed(user) and instance.owner_id == user.id
        )
        # The floor plan is the owner's working document (and reaches buyers
        # through the event's own seat map), not part of a public listing.
        if not owner:
            data.pop("layout", None)
        return data


#: How to reach the venue directly, who owns it, and its floor plan. The
#: public page is about the room and its nights; the owner and staff see the rest.
_VENUE_OWNER_ONLY = ("contact_email", "contact_phone", "owner_name", "owner", "layout", "operator_access")


def _event_card(event, request):
    """What a venue page needs to show one of its nights."""
    poster = None
    if event.poster_image:
        poster = request.build_absolute_uri(event.poster_image.url) if request else event.poster_image.url
    return {
        "id": str(event.id),
        "title": event.title,
        "start_datetime": event.start_datetime.isoformat(),
        "poster_image": poster,
        "genres": [g.name for g in event.genres.all()],
    }


class VenueDetailSerializer(PayoutDetailReadMixin, serializers.ModelSerializer):
    city = CitySerializer(read_only=True)
    area = AreaSerializer(read_only=True)
    photos = VenuePhotoSerializer(many=True, read_only=True)
    hours = VenueHoursSerializer(many=True, read_only=True)
    owner_name = serializers.CharField(source="owner.name", read_only=True)
    # The account number itself is never returned — only how it can be
    # recognised by whoever entered it ("ending in 4321").
    bank_account_last4 = serializers.ReadOnlyField()
    has_bank_details = serializers.ReadOnlyField()
    can_receive_payouts = serializers.ReadOnlyField()
    follower_count = serializers.SerializerMethodField()
    is_following = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()
    recent_reviews = serializers.SerializerMethodField()
    upcoming_events = serializers.SerializerMethodField()
    past_events = serializers.SerializerMethodField()

    class Meta:
        model = Venue
        # Everything but the soft-delete bookkeeping, so `layout` (the floor
        # plan the host designs) is read back here and written through
        # VenueCreateUpdateSerializer below without a bespoke endpoint.
        exclude = ["is_deleted", "deleted_at", "bank_account_number"]

    def _is_payout_owner(self, instance, user):
        return instance.owner_id == user.id

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        owner = privacy.is_staff(user) or (
            privacy._authed(user) and instance.owner_id == user.id
        )
        if not owner:
            for key in _VENUE_OWNER_ONLY:
                data.pop(key, None)
        return data

    # ── Public reputation: what people who went said, and who follows ────────
    def _reviews(self, obj):
        from apps.events.models import EventReview
        return EventReview.objects.filter(event__venue=obj, is_published=True)

    def get_follower_count(self, obj):
        return obj.followers.count()

    def get_is_following(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        return bool(privacy._authed(user) and obj.followers.filter(user=user).exists())

    def get_avg_rating(self, obj):
        from django.db.models import Avg
        avg = self._reviews(obj).aggregate(a=Avg("rating"))["a"]
        return round(float(avg), 1) if avg is not None else None

    def get_review_count(self, obj):
        return self._reviews(obj).count()

    def get_recent_reviews(self, obj):
        rows = self._reviews(obj).select_related("reviewer", "event").order_by("-created_at")[:5]
        return [{
            "id": str(r.id),
            "reviewer_name": r.reviewer.name,
            "rating": r.rating,
            "comment": r.comment,
            "event_title": r.event.title,
            "is_verified_attendee": r.is_verified_attendee,
            "created_at": r.created_at.isoformat(),
        } for r in rows]

    def _events(self, obj):
        from apps.events.models import Event, EventStatus
        return Event.objects.filter(
            venue=obj, is_deleted=False,
            status__in=[EventStatus.PUBLISHED, EventStatus.SOLD_OUT, EventStatus.LIVE, EventStatus.PAST],
        ).prefetch_related("genres")

    def get_upcoming_events(self, obj):
        from django.utils import timezone
        request = self.context.get("request")
        rows = self._events(obj).filter(end_datetime__gte=timezone.now()).order_by("start_datetime")[:12]
        return [_event_card(e, request) for e in rows]

    def get_past_events(self, obj):
        from django.utils import timezone
        request = self.context.get("request")
        rows = self._events(obj).filter(end_datetime__lt=timezone.now()).order_by("-start_datetime")[:12]
        return [_event_card(e, request) for e in rows]


class VenueCreateUpdateSerializer(PayoutFieldsMixin, serializers.ModelSerializer):
    # Same forgiveness as artist profiles: a venue owner typing "myvenue.in"
    # should not be told it is invalid.
    contact_phone = IndianPhoneField()
    website = ForgivingURLField()
    facebook = ForgivingURLField()
    google_maps_url = ForgivingURLField()
    instagram = SocialHandleField(platform="Instagram", hosts=("instagram.com",))
    twitter = SocialHandleField(platform="X", hosts=("twitter.com", "x.com"))
    # Settable, but never echoed back — see VenueDetailSerializer for why.
    bank_account_number = serializers.CharField(
        required=False, allow_blank=True, max_length=34, write_only=True,
    )

    class Meta:
        model = Venue
        exclude = ["owner", "is_deleted", "deleted_at", "is_verified", "is_featured", "slug"]
        read_only_fields = PAYOUT_READ_ONLY_FIELDS

    def create(self, validated_data):
        from django.utils.text import slugify
        import uuid as _uuid
        name = validated_data.get("name", "")
        slug = slugify(name)
        if Venue.objects.filter(slug=slug).exists():
            slug = f"{slug}-{str(_uuid.uuid4())[:8]}"
        validated_data["slug"] = slug
        validated_data["owner"] = self.context["request"].user
        instance = super().create(validated_data)
        touched = self.apply_payout_side_effects(instance, validated_data)
        if touched:
            instance.save(update_fields=touched)
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        touched = self.apply_payout_side_effects(instance, validated_data)
        if touched:
            instance.save(update_fields=touched)
        return instance
