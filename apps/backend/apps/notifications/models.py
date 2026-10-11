import uuid
from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from apps.core.models import TimeStampedModel


class NotificationType(models.TextChoices):
    TICKET_CONFIRMED = "ticket_confirmed", "Ticket Confirmed"
    TICKET_CANCELLED = "ticket_cancelled", "Ticket Cancelled"
    EVENT_REMINDER = "event_reminder", "Event Reminder"
    EVENT_CANCELLED = "event_cancelled", "Event Cancelled"
    EVENT_UPDATED = "event_updated", "Event Updated"
    PAYMENT_SUCCESS = "payment_success", "Payment Success"
    PAYMENT_FAILED = "payment_failed", "Payment Failed"
    REFUND_INITIATED = "refund_initiated", "Refund Initiated"
    REFUND_SUCCESS = "refund_success", "Refund Success"
    NEW_MESSAGE = "new_message", "New Message"
    BOOKING_OFFER = "booking_offer", "Booking Offer Received"
    BOOKING_OFFER_ACCEPTED = "booking_offer_accepted", "Booking Offer Accepted"
    BOOKING_OFFER_DECLINED = "booking_offer_declined", "Booking Offer Declined"
    BOOKING_OFFER_WITHDRAWN = "booking_offer_withdrawn", "Booking Offer Withdrawn"
    GIG_APPLICATION_REVIEWED = "gig_application_reviewed", "Gig Application Reviewed"
    ARTIST_NEW_EVENT = "artist_new_event", "Artist Posted New Event"
    TICKET_TRANSFER_RECEIVED = "ticket_transfer_received", "Ticket Transfer Received"
    OTP_SENT = "otp_sent", "OTP Sent"
    WELCOME = "welcome", "Welcome"
    GATE_INVITE = "gate_invite", "Gatekeeper Invitation"
    GATE_RESPONSE = "gate_response", "Gatekeeper Response"


class Channel(models.TextChoices):
    EMAIL = "email", "Email"
    PUSH = "push", "Push Notification"
    IN_APP = "in_app", "In-App"


class NotificationPreference(TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name="notification_prefs")
    ticket_confirmed_email = models.BooleanField(default=True)
    ticket_confirmed_push = models.BooleanField(default=True)
    event_reminder_email = models.BooleanField(default=True)
    event_reminder_push = models.BooleanField(default=True)
    event_reminder_hours_before = models.PositiveSmallIntegerField(default=24)
    new_message_push = models.BooleanField(default=True)
    # Offers, offer replies and gig-application decisions. Default on: a
    # working musician who misses an offer email loses the gig.
    booking_activity_email = models.BooleanField(default=True)
    # A gig you hold a ticket for was cancelled, moved or re-venued.
    event_change_email = models.BooleanField(default=True)
    artist_new_event_email = models.BooleanField(default=False)
    artist_new_event_push = models.BooleanField(default=True)
    marketing_email = models.BooleanField(default=False)


class Notification(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name="notifications")
    notification_type = models.CharField(max_length=40, choices=NotificationType.choices,
                                          db_index=True)
    channel = models.CharField(max_length=10, choices=Channel.choices)
    title = models.CharField(max_length=200)
    body = models.TextField()
    data = models.JSONField(default=dict, blank=True,
                             help_text="Deeplink payload, object IDs, etc.")
    action_url = models.CharField(max_length=300, blank=True)

    is_read = models.BooleanField(default=False, db_index=True)
    read_at = models.DateTimeField(null=True, blank=True)
    is_sent = models.BooleanField(default=False)
    sent_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)

    # Generic FK so a notification can link to any object
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, null=True, blank=True)
    object_id = models.CharField(max_length=36, blank=True)
    related_object = GenericForeignKey("content_type", "object_id")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "is_read"]),
                   models.Index(fields=["user", "notification_type"])]

    def __str__(self):
        return f"{self.notification_type} → {self.user.email}"

    def mark_read(self):
        from django.utils import timezone
        self.is_read = True
        self.read_at = timezone.now()
        self.save(update_fields=["is_read", "read_at"])
