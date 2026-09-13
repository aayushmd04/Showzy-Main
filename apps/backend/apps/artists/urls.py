from django.urls import path
from . import views

urlpatterns = [
    path("artists/", views.ArtistListCreateView.as_view(), name="artists-list"),
    # Must precede the <uuid:pk> route so "mine" is never treated as an id.
    path("artists/mine/", views.my_artist_profile, name="artists-mine"),
    path("artists/<uuid:pk>/", views.ArtistDetailView.as_view(), name="artists-detail"),
    path("artists/<uuid:pk>/follow/", views.follow_artist, name="artists-follow"),
    path("artists/<uuid:pk>/photos/", views.upload_artist_photo, name="artists-photos"),
    path("artists/<uuid:pk>/photos/<int:photo_id>/primary/",
         views.set_primary_artist_photo, name="artists-photo-primary"),
    path("artists/<uuid:pk>/photos/<int:photo_id>/delete/",
         views.delete_artist_photo, name="artists-photo-delete"),
    path("admin/artists/kyc/", views.admin_artist_kyc_queue, name="admin-artist-kyc-queue"),
    path("admin/artists/<uuid:pk>/kyc/", views.set_artist_kyc, name="admin-artist-kyc-set"),
]
