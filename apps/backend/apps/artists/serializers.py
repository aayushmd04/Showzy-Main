from rest_framework import serializers
from .models import Artist, ArtistPhoto, ArtistFollower
from apps.core.serializers import GenreSerializer


class ArtistPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ArtistPhoto
        fields = ["id", "image", "caption", "is_primary", "sort_order"]


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
        if obj.user_id:
            return {"id": str(obj.user_id), "full_name": obj.user.full_name, "email": obj.user.email}
        return {"id": "", "full_name": obj.stage_name, "email": ""}

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
    city_name = serializers.CharField(source="city.name", read_only=True, allow_null=True)
    is_following = serializers.SerializerMethodField()

    class Meta:
        model = Artist
        exclude = ["is_deleted", "deleted_at", "user"]

    def get_is_following(self, obj):
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            return ArtistFollower.objects.filter(artist=obj, user=request.user).exists()
        return False


class ArtistCreateUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Artist
        exclude = ["user", "is_deleted", "deleted_at", "is_verified", "is_featured",
                   "follower_count"]
