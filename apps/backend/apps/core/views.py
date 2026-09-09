from rest_framework import generics, permissions
from .models import City, Area, Genre
from .serializers import CitySerializer, AreaSerializer, GenreSerializer


class CityListView(generics.ListAPIView):
    queryset = City.objects.filter(is_active=True)
    serializer_class = CitySerializer
    permission_classes = [permissions.AllowAny]


class AreaListView(generics.ListAPIView):
    serializer_class = AreaSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        qs = Area.objects.filter(is_active=True).select_related("city")
        city = self.request.query_params.get("city")
        if city:
            qs = qs.filter(city__slug=city)
        return qs


class GenreListView(generics.ListAPIView):
    queryset = Genre.objects.filter(is_active=True)
    serializer_class = GenreSerializer
    permission_classes = [permissions.AllowAny]
