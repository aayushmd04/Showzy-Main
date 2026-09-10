import uuid
from django.db import models
from django.conf import settings
from apps.core.models import TimeStampedModel, SoftDeleteModel


class Artist(TimeStampedModel, SoftDeleteModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                null=True, blank=True, related_name="artist_profile")
    stage_name = models.CharField(max_length=120)
    stage_name_kn = models.CharField(max_length=120, blank=True)
    bio = models.TextField(blank=True, max_length=1000)
    bio_kn = models.TextField(blank=True, max_length=1000)
    city = models.ForeignKey("core.City", on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="artists")
    genres = models.ManyToManyField("core.Genre", blank=True, related_name="artists")

    booking_email = models.EmailField(blank=True)
    booking_phone = models.CharField(max_length=20, blank=True)
    booking_fee_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    booking_fee_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    booking_notes = models.TextField(blank=True)

    # Hosts open almost every conversation with "are you free on the 14th?".
    # A dict is proportionate: the artist marks the dates they cannot play and
    # adds a line of context. Shape (enforced in ArtistAvailabilityField):
    #   {"blackout_dates": ["2026-08-14", ...], "notes": "Touring in July."}
    # An empty dict means "no dates blocked", which is also the default.
    availability = models.JSONField(default=dict, blank=True)

    instagram = models.CharField(max_length=80, blank=True)
    youtube = models.URLField(blank=True)
    spotify = models.URLField(blank=True)
    soundcloud = models.URLField(blank=True)
    apple_music = models.URLField(blank=True)
    website = models.URLField(blank=True)

    follower_count = models.PositiveIntegerField(default=0)
    is_verified = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    years_active = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["stage_name"]
        indexes = [models.Index(fields=["is_featured", "is_active"])]

    def __str__(self):
        return self.stage_name


class ArtistPhoto(TimeStampedModel):
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="artists/%Y/%m/")
    caption = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "-created_at"]

    def save(self, *args, **kwargs):
        if self.is_primary:
            ArtistPhoto.objects.filter(artist=self.artist, is_primary=True).update(is_primary=False)
        super().save(*args, **kwargs)


class ArtistFollower(TimeStampedModel):
    artist = models.ForeignKey(Artist, on_delete=models.CASCADE, related_name="followers")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="following_artists")
    followed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("artist", "user")]
        ordering = ["-followed_at"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        self.artist.__class__.objects.filter(pk=self.artist.pk).update(
            follower_count=models.F("follower_count") + 1
        )

    def delete(self, *args, **kwargs):
        self.artist.__class__.objects.filter(pk=self.artist.pk).update(
            follower_count=models.F("follower_count") - 1
        )
        super().delete(*args, **kwargs)
