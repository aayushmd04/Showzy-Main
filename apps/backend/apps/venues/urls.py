from django.urls import path
from . import views

urlpatterns = [
    path("venues/", views.VenueListCreateView.as_view(), name="venues-list"),
    path("venues/<slug:slug>/", views.VenueDetailView.as_view(), name="venues-detail"),
    path("venues/<slug:slug>/photos/", views.upload_venue_photo, name="venues-photos"),
    path("admin/venues/kyc/", views.admin_venue_kyc_queue, name="admin-venue-kyc-queue"),
    path("admin/venues/<slug:slug>/kyc/", views.set_venue_kyc, name="admin-venue-kyc-set"),
]
