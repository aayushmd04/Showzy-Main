from django.db import models as dj_models
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from apps.core.models import KYCStatus
from .models import Artist, ArtistFollower, ArtistPhoto
from .serializers import (
    ArtistListSerializer, ArtistDetailSerializer, ArtistCreateUpdateSerializer,
    ArtistPhotoSerializer,
)


class IsArtistOwnerOrReadOnly(permissions.BasePermission):
    """Anyone may read an artist profile; only the linked user may modify it.

    Mirrors ``IsVenueOwnerOrReadOnly`` in apps.venues.views. Artist.user is a
    nullable OneToOneField, so an unclaimed profile (user_id is None) is
    read-only for everybody — it must be claimed via admin first.
    """

    message = "You can only edit your own artist profile."

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        if not request.user or not request.user.is_authenticated:
            return False
        return obj.user_id is not None and obj.user_id == request.user.id


class ArtistListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        return ArtistCreateUpdateSerializer if self.request.method == "POST" else ArtistListSerializer

    def get_permissions(self):
        return [permissions.IsAuthenticated()] if self.request.method == "POST" else [permissions.AllowAny()]

    def get_queryset(self):
        qs = Artist.objects.filter(is_active=True, is_deleted=False).prefetch_related("genres", "photos")
        city = self.request.query_params.get("city")
        genre = self.request.query_params.get("genre")
        featured = self.request.query_params.get("featured")
        if city:
            qs = qs.filter(city__slug=city)
        if genre:
            qs = qs.filter(genres__slug=genre)
        if featured:
            qs = qs.filter(is_featured=True)
        return qs

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ArtistDetailView(generics.RetrieveUpdateAPIView):
    queryset = (
        Artist.objects.filter(is_active=True, is_deleted=False)
        .select_related("city")
        .prefetch_related("genres", "photos")
    )
    permission_classes = [IsArtistOwnerOrReadOnly]

    def get_serializer_class(self):
        return ArtistCreateUpdateSerializer if self.request.method in ["PUT", "PATCH"] else ArtistDetailSerializer

    def update(self, request, *args, **kwargs):
        """Answer a write with the same shape a read returns.

        DRF would otherwise echo the write serializer, whose genres are bare
        ids and whose fees use the internal ``booking_fee_*`` names — so every
        client had to re-fetch the profile to redraw it after saving.
        """
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        # Re-read through the queryset: the prefetched genres on `instance` are
        # the pre-save set once the m2m has been rewritten.
        fresh = self.get_queryset().get(pk=instance.pk)
        return Response(
            ArtistDetailSerializer(fresh, context=self.get_serializer_context()).data
        )


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_artist_profile(request):
    """Return the artist profile linked to the authenticated user.

    Artist.user is a OneToOneField, so there is at most one row per user.
    """
    artist = Artist.objects.filter(
        user=request.user, is_deleted=False
    ).prefetch_related("genres", "photos").select_related("city").first()

    if artist is None:
        return Response(
            {"detail": "No artist profile is linked to this account. Create one at POST /api/v1/artists/."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(ArtistDetailSerializer(artist, context={"request": request}).data)


def _own_artist_or_error(request, pk):
    """Resolve an artist the caller is allowed to modify.

    Returns ``(artist, None)`` or ``(None, Response)`` — the same ownership
    rule ``IsArtistOwnerOrReadOnly`` applies to the detail endpoint, spelled
    out here because function views get no object-permission hook.
    """
    artist = generics.get_object_or_404(Artist, pk=pk, is_deleted=False)
    if artist.user_id is None or artist.user_id != request.user.id:
        return None, Response(
            {"detail": "You can only change photos on your own artist profile."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return artist, None


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])
def upload_artist_photo(request, pk):
    """Attach a photo to an artist profile. Mirrors ``upload_venue_photo``."""
    artist, error = _own_artist_or_error(request, pk)
    if error:
        return error
    serializer = ArtistPhotoSerializer(data=request.data, context={"request": request})
    serializer.is_valid(raise_exception=True)
    # The first photo an artist uploads is their cover; nothing else would be.
    is_primary = serializer.validated_data.get("is_primary") or not artist.photos.exists()
    serializer.save(artist=artist, is_primary=is_primary)
    return Response(serializer.data, status=status.HTTP_201_CREATED)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def set_primary_artist_photo(request, pk, photo_id):
    """Promote one photo to the profile cover. ``ArtistPhoto.save`` demotes the rest."""
    artist, error = _own_artist_or_error(request, pk)
    if error:
        return error
    photo = generics.get_object_or_404(ArtistPhoto, pk=photo_id, artist=artist)
    photo.is_primary = True
    photo.save()
    return Response(ArtistPhotoSerializer(photo, context={"request": request}).data)


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def delete_artist_photo(request, pk, photo_id):
    """Remove a photo. POST is accepted alongside DELETE so browser clients
    that only speak GET/POST/PATCH can still undo a bad upload."""
    artist, error = _own_artist_or_error(request, pk)
    if error:
        return error
    photo = generics.get_object_or_404(ArtistPhoto, pk=photo_id, artist=artist)
    was_primary = photo.is_primary
    photo.delete()
    if was_primary:
        # Never leave a profile with photos but no cover — the card would go blank.
        replacement = artist.photos.first()
        if replacement:
            replacement.is_primary = True
            replacement.save()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def follow_artist(request, pk):
    artist = generics.get_object_or_404(Artist, pk=pk, is_active=True)
    if request.method == "POST":
        ArtistFollower.objects.get_or_create(artist=artist, user=request.user)
        return Response({"following": True})
    else:
        ArtistFollower.objects.filter(artist=artist, user=request.user).delete()
        return Response({"following": False})


# ─── Admin — artist KYC ────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def admin_artist_kyc_queue(request):
    """Admin view of every artist, submitted-for-review first — mirrors
    `organizer_kyc_queue` in apps.bookings.views exactly."""
    order = dj_models.Case(
        dj_models.When(kyc_status=KYCStatus.SUBMITTED, then=0),
        dj_models.When(kyc_status=KYCStatus.PENDING, then=1),
        dj_models.When(kyc_status=KYCStatus.REJECTED, then=2),
        default=3,
        output_field=dj_models.IntegerField(),
    )
    artists = Artist.objects.filter(is_deleted=False).annotate(_kyc_order=order).order_by(
        "_kyc_order", "stage_name"
    )
    return Response(ArtistDetailSerializer(artists, many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def set_artist_kyc(request, pk):
    """Admin approves or rejects an artist's KYC — the real gate on
    `can_receive_payouts`. Mirrors `set_organizer_kyc`."""
    artist = Artist.objects.filter(pk=pk, is_deleted=False).first()
    if not artist:
        return Response({"detail": "Not found."}, status=404)

    new_status = request.data.get("status")
    if new_status not in [KYCStatus.VERIFIED, KYCStatus.REJECTED]:
        return Response({"detail": "status must be verified or rejected."}, status=400)

    artist.kyc_status = new_status
    if new_status == KYCStatus.VERIFIED:
        artist.kyc_verified_at = timezone.now()
        artist.kyc_rejection_reason = ""
    else:
        artist.kyc_rejection_reason = request.data.get("rejection_reason", "")
    artist.save(update_fields=["kyc_status", "kyc_verified_at", "kyc_rejection_reason"])
    return Response(ArtistDetailSerializer(artist, context={"request": request}).data)
