import uuid
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator
from apps.core.models import TimeStampedModel, SoftDeleteModel


class EventType(models.TextChoices):
    CONCERT = "concert", "Concert"
    OPEN_MIC = "open_mic", "Open Mic"
    THEATRE = "theatre", "Theatre"
    CLASSICAL = "classical", "Classical Music"
    JAZZ = "jazz", "Jazz"
    FOLK = "folk", "Folk"
    WORKSHOP = "workshop", "Workshop"
    COMEDY = "comedy", "Comedy"
    OTHER = "other", "Other"


class EventStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    CANCELLED = "cancelled", "Cancelled"
    POSTPONED = "postponed", "Postponed"
    SOLD_OUT = "sold_out", "Sold Out"
    LIVE = "live", "Live Now"
    PAST = "past", "Past"


class Event(TimeStampedModel, SoftDeleteModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                  related_name="organized_events")
    venue = models.ForeignKey("venues.Venue", on_delete=models.PROTECT, related_name="events")
    genres = models.ManyToManyField("core.Genre", blank=True, related_name="events")
    artists = models.ManyToManyField("artists.Artist", through="EventArtist",
                                     blank=True, related_name="events")

    title = models.CharField(max_length=200)
    title_kn = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    description_kn = models.TextField(blank=True)
    tagline = models.CharField(max_length=200, blank=True)
    additional_info = models.JSONField(default=dict, blank=True,
                                       help_text="FAQs, dress code, parking, etc.")

    event_type = models.CharField(max_length=20, choices=EventType.choices, default=EventType.CONCERT)
    status = models.CharField(max_length=20, choices=EventStatus.choices,
                               default=EventStatus.DRAFT, db_index=True)

    start_datetime = models.DateTimeField(db_index=True)
    end_datetime = models.DateTimeField()
    doors_open_at = models.DateTimeField(null=True, blank=True)

    is_free = models.BooleanField(default=False, db_index=True)
    min_age = models.PositiveSmallIntegerField(null=True, blank=True)
    max_capacity = models.PositiveIntegerField(null=True, blank=True)
    actual_capacity_override = models.PositiveIntegerField(null=True, blank=True)

    poster_image = models.ImageField(upload_to="events/posters/%Y/%m/", null=True, blank=True)
    banner_image = models.ImageField(upload_to="events/banners/%Y/%m/", null=True, blank=True)

    is_featured = models.BooleanField(default=False, db_index=True)
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(max_length=200, blank=True,
                                       help_text="iCal RRULE string")
    language = models.CharField(max_length=5, choices=[("en", "English"), ("kn", "Kannada"),
                                                        ("both", "Both")], default="en")

    published_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)
    postponed_to = models.DateTimeField(null=True, blank=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="+")

    # ── Gig-brief fields (Marketplace B) ─────────────────────────────────────
    # When is_seeking_artists=True this event is visible on the gig board for artists to apply.
    is_seeking_artists = models.BooleanField(default=False, db_index=True)
    performance_budget_min = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    performance_budget_max = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    artist_requirements = models.TextField(blank=True, help_text="Instruments, genre, experience notes for applicants")
    application_deadline = models.DateTimeField(null=True, blank=True)
    preferred_artist_count = models.PositiveSmallIntegerField(default=1)

    class Meta:
        ordering = ["start_datetime"]
        indexes = [
            models.Index(fields=["status", "start_datetime"]),
            models.Index(fields=["venue", "start_datetime"]),
            models.Index(fields=["is_featured"]),
        ]

    def __str__(self):
        return f"{self.title} @ {self.venue.name}"

    @property
    def total_sold(self):
        return self.ticket_tiers.aggregate(s=models.Sum("sold_quantity"))["s"] or 0

    @property
    def total_capacity(self):
        return (self.actual_capacity_override or
                self.ticket_tiers.aggregate(s=models.Sum("total_quantity"))["s"] or 0)

    @property
    def is_sold_out(self):
        return self.ticket_tiers.filter(
            models.Q(total_quantity__lte=models.F("sold_quantity")) & models.Q(is_active=True)
        ).count() == self.ticket_tiers.filter(is_active=True).count()


class EventArtist(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="event_artists")
    artist = models.ForeignKey("artists.Artist", on_delete=models.CASCADE,
                               related_name="event_appearances")
    performance_order = models.PositiveSmallIntegerField(default=1)
    is_headliner = models.BooleanField(default=False)
    set_duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    performance_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=200, blank=True)

    class Meta:
        unique_together = [("event", "artist")]
        ordering = ["performance_order"]


class EventPhoto(TimeStampedModel):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField(upload_to="events/gallery/%Y/%m/")
    caption = models.CharField(max_length=200, blank=True)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                    null=True, related_name="+")

    class Meta:
        ordering = ["sort_order"]


class EventSave(TimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="saved_events")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="saves")

    class Meta:
        unique_together = [("user", "event")]
        ordering = ["-created_at"]


class EventView(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="views")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name="+")
    session_id = models.CharField(max_length=40, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    referrer = models.URLField(blank=True)
    viewed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-viewed_at"]


class EventReview(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name="event_reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.TextField(blank=True, max_length=1000)
    is_verified_attendee = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)

    class Meta:
        unique_together = [("event", "reviewer")]
        ordering = ["-created_at"]
