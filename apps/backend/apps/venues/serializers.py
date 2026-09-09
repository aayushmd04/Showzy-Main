from rest_framework import serializers
from .models import Venue, VenuePhoto, VenueHours, VenueOperatorAccess
from apps.core.serializers import CitySerializer, AreaSerializer


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
        ]

    def get_primary_photo(self, obj):
        photo = obj.photos.filter(is_primary=True).first() or obj.photos.first()
        if photo:
            request = self.context.get("request")
            return request.build_absolute_uri(photo.image.url) if request and photo.image else None
        return None


class VenueDetailSerializer(serializers.ModelSerializer):
    city = CitySerializer(read_only=True)
    area = AreaSerializer(read_only=True)
    photos = VenuePhotoSerializer(many=True, read_only=True)
    hours = VenueHoursSerializer(many=True, read_only=True)
    owner_name = serializers.CharField(source="owner.name", read_only=True)

    class Meta:
        model = Venue
        exclude = ["is_deleted", "deleted_at"]


class VenueCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Venue
        exclude = ["owner", "is_deleted", "deleted_at", "is_verified", "is_featured", "slug"]

    def create(self, validated_data):
        from django.utils.text import slugify
        import uuid as _uuid
        name = validated_data.get("name", "")
        slug = slugify(name)
        if Venue.objects.filter(slug=slug).exists():
            slug = f"{slug}-{str(_uuid.uuid4())[:8]}"
        validated_data["slug"] = slug
        validated_data["owner"] = self.context["request"].user
        return super().create(validated_data)
