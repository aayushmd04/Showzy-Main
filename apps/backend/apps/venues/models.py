import uuid
from django.db import models
from django.conf import settings
from apps.core.models import TimeStampedModel, SoftDeleteModel


class StageType(models.TextChoices):
    INDOOR = "indoor", "Indoor"
    OUTDOOR = "outdoor", "Outdoor"
    BOTH = "both", "Indoor & Outdoor"


class Venue(TimeStampedModel, SoftDeleteModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                              related_name="owned_venues")
    name = models.CharField(max_length=150)
    name_kn = models.CharField(max_length=150, blank=True)
    slug = models.SlugField(unique=True, max_length=180)
    description = models.TextField(blank=True)
    description_kn = models.TextField(blank=True)
    tagline = models.CharField(max_length=200, blank=True)

    address_line1 = models.CharField(max_length=200)
    address_line2 = models.CharField(max_length=200, blank=True)
    area = models.ForeignKey("core.Area", on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="venues")
    city = models.ForeignKey("core.City", on_delete=models.PROTECT, related_name="venues")
    pincode = models.CharField(max_length=10, blank=True)
    lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    google_maps_url = models.URLField(blank=True)

    capacity = models.PositiveIntegerField(default=0)
    stage_type = models.CharField(max_length=10, choices=StageType.choices, default=StageType.INDOOR)
    has_parking = models.BooleanField(default=False)
    is_accessible = models.BooleanField(default=False, help_text="Wheelchair accessible")
    has_bar = models.BooleanField(default=False)
    has_restaurant = models.BooleanField(default=False)
    has_ac = models.BooleanField(default=False)
    has_sound_system = models.BooleanField(default=False)
    has_projector = models.BooleanField(default=False)
    age_restriction = models.PositiveSmallIntegerField(null=True, blank=True,
                                                       help_text="Minimum age, e.g. 18")
    smoking_policy = models.CharField(max_length=100, blank=True)
    dress_code = models.CharField(max_length=100, blank=True)
    policies = models.JSONField(default=dict, blank=True)
    amenities = models.JSONField(default=list, blank=True)

    # Floor plan authored in the host console's layout designer. Shape:
    # {"version": 1, "elements": [{id, type, x, y, w, h, label, capacity}, ...]}
    # Percentages of the canvas, so it renders at any size. Stored server-side
    # rather than in the host's browser because door staff and ticket buyers
    # both need to see it, and seat-level ticketing reads capacity from it.
    layout = models.JSONField(default=dict, blank=True)

    contact_phone = models.CharField(max_length=20, blank=True)
    contact_email = models.EmailField(blank=True)
    website = models.URLField(blank=True)
    instagram = models.CharField(max_length=80, blank=True)
    facebook = models.URLField(blank=True)
    twitter = models.CharField(max_length=80, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    is_verified = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)
    established_year = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["city", "is_active"]),
                   models.Index(fields=["is_featured"])]

    def __str__(self):
        return f"{self.name} ({self.city.name})"


class VenuePhoto(TimeStampedModel):
    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="venues/%Y/%m/")
    caption = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="+")

    class Meta:
        ordering = ["sort_order", "-created_at"]

    def save(self, *args, **kwargs):
        if self.is_primary:
            VenuePhoto.objects.filter(venue=self.venue, is_primary=True).update(is_primary=False)
        super().save(*args, **kwargs)


class VenueOperatorAccess(TimeStampedModel):
    class AccessRole(models.TextChoices):
        OWNER = "owner", "Owner"
        MANAGER = "manager", "Manager"
        STAFF = "staff", "Staff (scan only)"

    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="operator_access")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="venue_access")
    role = models.CharField(max_length=10, choices=AccessRole.choices)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="+")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("venue", "user")]

    def __str__(self):
        return f"{self.user.email} → {self.venue.name} ({self.role})"


class VenueHours(models.Model):
    class Day(models.IntegerChoices):
        MONDAY = 0, "Monday"
        TUESDAY = 1, "Tuesday"
        WEDNESDAY = 2, "Wednesday"
        THURSDAY = 3, "Thursday"
        FRIDAY = 4, "Friday"
        SATURDAY = 5, "Saturday"
        SUNDAY = 6, "Sunday"

    venue = models.ForeignKey(Venue, on_delete=models.CASCADE, related_name="hours")
    day_of_week = models.PositiveSmallIntegerField(choices=Day.choices)
    open_time = models.TimeField()
    close_time = models.TimeField()
    is_closed = models.BooleanField(default=False)
    notes = models.CharField(max_length=100, blank=True)

    class Meta:
        unique_together = [("venue", "day_of_week")]
        ordering = ["day_of_week"]
