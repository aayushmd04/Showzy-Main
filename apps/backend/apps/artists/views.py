from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Artist, ArtistFollower
from .serializers import ArtistListSerializer, ArtistDetailSerializer, ArtistCreateUpdateSerializer


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

    def get_serializer_class(self):
        return ArtistCreateUpdateSerializer if self.request.method in ["PUT", "PATCH"] else ArtistDetailSerializer


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
