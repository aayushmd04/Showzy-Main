from rest_framework import serializers
from .models import Venue, VenuePhoto, VenueHours, VenueOperatorAccess
from apps.core.serializers import CitySerializer, AreaSerializer
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

    class Meta:
        model = Venue
        # Everything but the soft-delete bookkeeping, so `layout` (the floor
        # plan the host designs) is read back here and written through
        # VenueCreateUpdateSerializer below without a bespoke endpoint.
        exclude = ["is_deleted", "deleted_at", "bank_account_number"]

    def _is_payout_owner(self, instance, user):
        return instance.owner_id == user.id


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
