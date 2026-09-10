from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Artist, ArtistFollower
from .serializers import ArtistListSerializer, ArtistDetailSerializer, ArtistCreateUpdateSerializer


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
    queryset = Artist.objects.filter(is_active=True, is_deleted=False)
    permission_classes = [IsArtistOwnerOrReadOnly]

    def get_serializer_class(self):
        return ArtistCreateUpdateSerializer if self.request.method in ["PUT", "PATCH"] else ArtistDetailSerializer


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
