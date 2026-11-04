from django.db import models as dj_models
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from apps.core.models import KYCStatus
from .models import Venue, VenueFollower, VenuePhoto
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

    def create(self, request, *args, **kwargs):
        """Answer a write with the same shape a read returns — see
        `ArtistDetailView.update` for why. Without this, a freshly-created
        venue's own response never carried its `slug` (excluded from the
        write serializer on purpose, since a client can't set it) or the
        payout fields (`bank_account_last4`, `kyc_status`, ...), so the host
        console would need an extra round trip just to learn its own venue's
        address.
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        instance = serializer.instance
        headers = self.get_success_headers(serializer.data)
        return Response(
            VenueDetailSerializer(instance, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED, headers=headers,
        )

    def get_queryset(self):
        qs = Venue.objects.filter(is_active=True, is_deleted=False).select_related("city", "area")
        city = self.request.query_params.get("city")
        featured = self.request.query_params.get("featured")
        mine = self.request.query_params.get("mine")
        if city:
            qs = qs.filter(city__slug=city)
        if featured:
            qs = qs.filter(is_featured=True)
        if mine and mine.lower() not in ("0", "false"):
            # The host console needs "which venues are mine?" to decide between
            # the venue editor and the create form. Anonymous callers asking for
            # `mine` get nothing rather than everyone else's venues.
            if self.request.user.is_authenticated:
                qs = qs.filter(owner=self.request.user)
            else:
                qs = qs.none()
        return qs.prefetch_related("photos")


class VenueDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Venue.objects.filter(is_active=True, is_deleted=False)
    lookup_field = "slug"
    permission_classes = [IsVenueOwnerOrReadOnly]

    def get_serializer_class(self):
        if self.request.method in ["PUT", "PATCH"]:
            return VenueCreateUpdateSerializer
        return VenueDetailSerializer

    def update(self, request, *args, **kwargs):
        """Answer a write with the same shape a read returns — mirrors
        `ArtistDetailView.update`."""
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(
            VenueDetailSerializer(serializer.instance, context=self.get_serializer_context()).data
        )

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


@api_view(["POST", "DELETE"])
@permission_classes([permissions.IsAuthenticated])
def follow_venue(request, slug):
    """Follow or unfollow a venue. POST follows, DELETE unfollows; both are idempotent."""
    venue = generics.get_object_or_404(Venue, slug=slug, is_active=True, is_deleted=False)
    if request.method == "POST":
        VenueFollower.objects.get_or_create(venue=venue, user=request.user)
    else:
        VenueFollower.objects.filter(venue=venue, user=request.user).delete()
    return Response({
        "following": request.method == "POST",
        "follower_count": venue.followers.count(),
    })


# ─── Admin — venue KYC ─────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def admin_venue_kyc_queue(request):
    """Admin view of every venue, submitted-for-review first — mirrors
    `organizer_kyc_queue` in apps.bookings.views exactly."""
    order = dj_models.Case(
        dj_models.When(kyc_status=KYCStatus.SUBMITTED, then=0),
        dj_models.When(kyc_status=KYCStatus.PENDING, then=1),
        dj_models.When(kyc_status=KYCStatus.REJECTED, then=2),
        default=3,
        output_field=dj_models.IntegerField(),
    )
    venues = Venue.objects.filter(is_deleted=False).annotate(_kyc_order=order).order_by(
        "_kyc_order", "name"
    )
    return Response(VenueDetailSerializer(venues, many=True, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def set_venue_kyc(request, slug):
    """Admin approves or rejects a venue's KYC — the real gate on
    `can_receive_payouts`. Mirrors `set_organizer_kyc`."""
    venue = Venue.objects.filter(slug=slug, is_deleted=False).first()
    if not venue:
        return Response({"detail": "Not found."}, status=404)

    new_status = request.data.get("status")
    if new_status not in [KYCStatus.VERIFIED, KYCStatus.REJECTED]:
        return Response({"detail": "status must be verified or rejected."}, status=400)

    venue.kyc_status = new_status
    if new_status == KYCStatus.VERIFIED:
        venue.kyc_verified_at = timezone.now()
        venue.kyc_rejection_reason = ""
    else:
        venue.kyc_rejection_reason = request.data.get("rejection_reason", "")
    venue.save(update_fields=["kyc_status", "kyc_verified_at", "kyc_rejection_reason"])
    return Response(VenueDetailSerializer(venue, context={"request": request}).data)
