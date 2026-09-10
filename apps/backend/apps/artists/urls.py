from django.urls import path
from . import views

urlpatterns = [
    path("artists/", views.ArtistListCreateView.as_view(), name="artists-list"),
    # Must precede the <uuid:pk> route so "mine" is never treated as an id.
    path("artists/mine/", views.my_artist_profile, name="artists-mine"),
    path("artists/<uuid:pk>/", views.ArtistDetailView.as_view(), name="artists-detail"),
    path("artists/<uuid:pk>/follow/", views.follow_artist, name="artists-follow"),
]
