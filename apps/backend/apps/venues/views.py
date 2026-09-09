from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Venue, VenuePhoto
from .serializers import (
    VenueListSerializer, VenueDetailSerializer, VenueCreateUpdateSerializer, VenuePhotoSerializer
)


class IsVenueOwnerOrReadOnly(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return obj.owner == request.user


class VenueListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        if self.request.method == "POST":
            return VenueCreateUpdateSerializer
        return VenueListSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = Venue.objects.filter(is_active=True, is_deleted=False).select_related("city", "area")
        city = self.request.query_params.get("city")
        featured = self.request.query_params.get("featured")
        if city:
            qs = qs.filter(city__slug=city)
        if featured:
            qs = qs.filter(is_featured=True)
        return qs.prefetch_related("photos")


class VenueDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Venue.objects.filter(is_active=True, is_deleted=False)
    lookup_field = "slug"
    permission_classes = [IsVenueOwnerOrReadOnly]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return VenueCreateUpdateSerializer
        return VenueDetailSerializer

    def perform_destroy(self, instance):
        instance.soft_delete()


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def upload_venue_photo(request, slug):
    venue = generics.get_object_or_404(Venue, slug=slug, is_deleted=False)
    if venue.owner != request.user:
        return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)
    serializer = VenuePhotoSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save(venue=venue, uploaded_by=request.user)
    return Response(serializer.data, status=status.HTTP_201_CREATED)
