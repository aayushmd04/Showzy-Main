from datetime import date

from rest_framework import serializers

from .models import Artist, ArtistPhoto, ArtistFollower
from apps.core.serializers import GenreSerializer
from apps.core.urlfields import ForgivingURLField, SocialHandleField

#: Ceiling on stored blackout dates. A year of blocked dates is already an
#: artist who is not taking bookings; beyond that it is a client bug.
MAX_BLACKOUT_DATES = 366
MAX_AVAILABILITY_NOTE = 280


class ArtistAvailabilityField(serializers.JSONField):
    """The ``Artist.availability`` blob, validated into a known shape.

    Stored and returned as ``{"blackout_dates": [...], "notes": "..."}`` so
    every reader — the public profile, the host's date question — can rely on
    both keys existing without defensive checks.
    """

    def to_representation(self, value):
        value = value if isinstance(value, dict) else {}
        return {
            "blackout_dates": value.get("blackout_dates") or [],
            "notes": value.get("notes") or "",
        }

    def to_internal_value(self, data):
        data = super().to_internal_value(data)
        if data in (None, ""):
            return {"blackout_dates": [], "notes": ""}
        if not isinstance(data, dict):
            raise serializers.ValidationError(
                "Availability must be an object with 'blackout_dates' and 'notes'."
            )
        unknown = set(data) - {"blackout_dates", "notes"}
        if unknown:
            raise serializers.ValidationError(
                "Unsupported availability keys: %s. Only 'blackout_dates' and "
                "'notes' are stored." % ", ".join(sorted(unknown))
            )

        raw_dates = data.get("blackout_dates") or []
        if not isinstance(raw_dates, list):
            raise serializers.ValidationError(
                "'blackout_dates' must be a list of YYYY-MM-DD dates."
            )
        if len(raw_dates) > MAX_BLACKOUT_DATES:
            raise serializers.ValidationError(
                "You can block at most %d dates." % MAX_BLACKOUT_DATES
            )
        cleaned = set()
        for item in raw_dates:
            if not isinstance(item, str):
                raise serializers.ValidationError(
                    "'blackout_dates' must be a list of YYYY-MM-DD dates."
                )
            try:
                date.fromisoformat(item)
            except ValueError:
                raise serializers.ValidationError(
                    "'%s' is not a date in YYYY-MM-DD form." % item
                )
            cleaned.add(item)

        notes = data.get("notes") or ""
        if not isinstance(notes, str):
            raise serializers.ValidationError("'notes' must be text.")

        return {
            "blackout_dates": sorted(cleaned),
            "notes": notes.strip()[:MAX_AVAILABILITY_NOTE],
        }


class ArtistPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArtistPhoto
        fields = ["id", "image", "caption", "is_primary", "sort_order"]


def _artist_user(obj):
    if obj.user_id:
        return {"id": str(obj.user_id), "full_name": obj.user.full_name, "email": obj.user.email}
    return {"id": "", "full_name": obj.stage_name, "email": ""}


class ArtistListSerializer(serializers.ModelSerializer):
    genres = GenreSerializer(many=True, read_only=True)
    primary_photo = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True, allow_null=True)
    user = serializers.SerializerMethodField()
    total_gigs = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    # Expose with consistent names the frontend adapter expects
    fee_range_min = serializers.DecimalField(source="booking_fee_min", max_digits=10, decimal_places=2, allow_null=True, read_only=True)
    fee_range_max = serializers.DecimalField(source="booking_fee_max", max_digits=10, decimal_places=2, allow_null=True, read_only=True)

    class Meta:
        model = Artist
        fields = [
            "id", "stage_name", "stage_name_kn", "city_name",
            "bio", "genres", "follower_count", "is_verified", "is_featured",
            "primary_photo", "instagram",
            "fee_range_min", "fee_range_max",
            "total_gigs", "avg_rating",
            "user",
        ]

    def get_user(self, obj):
        return _artist_user(obj)

    def get_total_gigs(self, obj):
        return obj.event_appearances.count()

    def get_avg_rating(self, obj):
        return 0.0

    def get_primary_photo(self, obj):
        photo = obj.photos.filter(is_primary=True).first() or obj.photos.first()
        if photo:
            request = self.context.get("request")
            return request.build_absolute_uri(photo.image.url) if request and photo.image else None
        return None


class ArtistDetailSerializer(serializers.ModelSerializer):
    genres = GenreSerializer(many=True, read_only=True)
    photos = ArtistPhotoSerializer(many=True, read_only=True)
    primary_photo = serializers.SerializerMethodField()
    city_name = serializers.CharField(source="city.name", read_only=True, allow_null=True)
    is_following = serializers.SerializerMethodField()
    availability = ArtistAvailabilityField(read_only=True)
    user = serializers.SerializerMethodField()
    total_gigs = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    # The write payload and the frontend adapter both speak fee_range_*; keep
    # the detail response using the same names as the list response.
    fee_range_min = serializers.DecimalField(source="booking_fee_min", max_digits=10, decimal_places=2, allow_null=True, read_only=True)
    fee_range_max = serializers.DecimalField(source="booking_fee_max", max_digits=10, decimal_places=2, allow_null=True, read_only=True)

    class Meta:
        model = Artist
        exclude = ["is_deleted", "deleted_at"]

    def get_user(self, obj):
        return _artist_user(obj)

    def get_total_gigs(self, obj):
        return obj.event_appearances.count()

    def get_avg_rating(self, obj):
        # No review model is wired to artists yet. Returning 0.0 keeps the
        # contract stable and lets the UI hide the rating rather than print a
        # number nobody earned.
        return 0.0

    def get_primary_photo(self, obj):
        photo = obj.photos.filter(is_primary=True).first() or obj.photos.first()
        if photo and photo.image:
            request = self.context.get("request")
            return request.build_absolute_uri(photo.image.url) if request else photo.image.url
        return None

    def get_is_following(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return ArtistFollower.objects.filter(artist=obj, user=request.user).exists()
        return False


class ArtistCreateUpdateSerializer(serializers.ModelSerializer):
    availability = ArtistAvailabilityField(required=False)
    # Nobody types "https://". These accept what a person actually writes and
    # normalise it, rather than refusing a perfectly good address.
    website = ForgivingURLField()
    youtube = ForgivingURLField()
    spotify = ForgivingURLField()
    soundcloud = ForgivingURLField()
    apple_music = ForgivingURLField()
    instagram = SocialHandleField(platform="Instagram", hosts=("instagram.com",))
    # Accepted under the same names the read serializers emit, so a client can
    # round-trip a profile without renaming half its fields.
    fee_range_min = serializers.DecimalField(
        source="booking_fee_min", max_digits=10, decimal_places=2,
        required=False, allow_null=True,
    )
    fee_range_max = serializers.DecimalField(
        source="booking_fee_max", max_digits=10, decimal_places=2,
        required=False, allow_null=True,
    )

    class Meta:
        model = Artist
        exclude = ["user", "is_deleted", "deleted_at", "is_verified", "is_featured",
                   "follower_count"]

    def validate(self, attrs):
        low = attrs.get("booking_fee_min", getattr(self.instance, "booking_fee_min", None))
        high = attrs.get("booking_fee_max", getattr(self.instance, "booking_fee_max", None))
        if low is not None and high is not None and low > high:
            raise serializers.ValidationError(
                {"fee_range_max": "The top of your fee range must be at least the bottom."}
            )
        return attrs
