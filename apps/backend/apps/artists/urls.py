from django.urls import path
from . import views

urlpatterns = [
    path("artists/", views.ArtistListCreateView.as_view(), name="artists-list"),
    path("artists/<uuid:pk>/", views.ArtistDetailView.as_view(), name="artists-detail"),
    path("artists/<uuid:pk>/follow/", views.follow_artist, name="artists-follow"),
]
