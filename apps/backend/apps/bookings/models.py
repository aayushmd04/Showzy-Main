import uuid
import re
from decimal import Decimal
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.core.models import TimeStampedModel, SoftDeleteModel

# ---------------------------------------------------------------------------
# Organizer — legal entity that hosts events and books artists
# ---------------------------------------------------------------------------

class Organizer(TimeStampedModel, SoftDeleteModel):
    """Venue or event-company entity. Both hosts and artists become Linked Accounts."""

    class OrgType(models.TextChoices):
        VENUE = "venue", "Venue"
        COMPANY = "company", "Event Company"
        INDIVIDUAL = "individual", "Individual Promoter"

    class KYCStatus(models.TextChoices):
        PENDING = "pending", "Pending"
        SUBMITTED = "submitted", "Submitted"
        VERIFIED = "verified", "Verified"
        REJECTED = "rejected", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=120)
    name_kn = models.CharField(max_length=120, blank=True)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    organizer_type = models.CharField(max_length=20, choices=OrgType.choices, default=OrgType.VENUE)

    # Razorpay Linked Account (KYC gate for receiving money)
    razorpay_account_id = models.CharField(max_length=60, blank=True, db_index=True)
    kyc_status = models.CharField(max_length=20, choices=KYCStatus.choices, default=KYCStatus.PENDING)
    kyc_submitted_at = models.DateTimeField(null=True, blank=True)
    kyc_verified_at = models.DateTimeField(null=True, blank=True)
    kyc_rejection_reason = models.TextField(blank=True)

    # Legal
    gst_number = models.CharField(max_length=20, blank=True)
    pan_number = models.CharField(max_length=20, blank=True)

    # Contact
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    website = models.URLField(blank=True)

    city = models.ForeignKey("core.City", on_delete=models.SET_NULL, null=True, blank=True)
    address = models.TextField(blank=True)
    logo = models.ImageField(upload_to="organizers/logos/", null=True, blank=True)

    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name

    @property
    def can_book_artists(self):
        """Organizer must be KYC-verified to create funded bookings."""
        return self.kyc_status == self.KYCStatus.VERIFIED


class Membership(TimeStampedModel):
    """User → Organizer role mapping (many users can manage one organizer)."""

    class Role(models.TextChoices):
        OWNER = "owner", "Owner"
        MANAGER = "manager", "Manager"
        STAFF = "staff", "Staff"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships")
    organizer = models.ForeignKey(Organizer, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.OWNER)
    invited_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="memberships_invited"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("user", "organizer")]

    def __str__(self):
        return f"{self.user.email} @ {self.organizer.name} ({self.role})"


# ---------------------------------------------------------------------------
# Gig Application — artist applies to an event open for talent
# ---------------------------------------------------------------------------

class GigApplication(TimeStampedModel):
    """Artist applies to an event flagged as seeking performers."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SHORTLISTED = "shortlisted", "Shortlisted"
        REJECTED = "rejected", "Rejected"
        ACCEPTED = "accepted", "Accepted"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="gig_applications")
    artist = models.ForeignKey("artists.Artist", on_delete=models.CASCADE, related_name="gig_applications")
    proposed_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    note = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="reviewed_applications"
    )

    class Meta:
        unique_together = [("event", "artist")]

    def __str__(self):
        return f"{self.artist} → {self.event} [{self.status}]"


# ---------------------------------------------------------------------------
# BookingConversation — 1:1 Host↔Artist negotiation thread
# ---------------------------------------------------------------------------

CONTACT_INFO_PATTERNS = [
    r'\b[6-9]\d{9}\b',                          # Indian mobile
    r'\b\d{10}\b',                               # generic 10-digit
    r'[\w.+\-]+@[\w\-]+\.[a-zA-Z]{2,}',         # email
    r'wa\.me\/',                                  # WhatsApp link
    r't\.me\/',                                   # Telegram
    r'instagram\.com\/[a-zA-Z0-9_.]+',           # Instagram profile URL
]


class BookingConversation(TimeStampedModel):
    """Dedicated 1:1 conversation for a booking negotiation. Separate from community chat."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey(Organizer, on_delete=models.CASCADE, related_name="conversations")
    artist = models.ForeignKey("artists.Artist", on_delete=models.CASCADE, related_name="booking_conversations")
    event = models.ForeignKey("events.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="booking_conversations")
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    is_active = models.BooleanField(default=True)
    last_message_at = models.DateTimeField(null=True, blank=True)

    # Contact-info filter state (disintermediation guard)
    contact_info_detected = models.BooleanField(default=False)
    contact_info_flagged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [("organizer", "artist", "event")]

    def __str__(self):
        return f"{self.organizer} ↔ {self.artist}"


class BookingMessage(TimeStampedModel):
    """Message in a BookingConversation. Contact-info filter applied pre-save."""

    class MsgType(models.TextChoices):
        TEXT = "text", "Text"
        OFFER = "offer", "Offer"
        SYSTEM = "system", "System"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(BookingConversation, on_delete=models.CASCADE, related_name="messages")
    sender = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    content = models.TextField()
    message_type = models.CharField(max_length=20, choices=MsgType.choices, default=MsgType.TEXT)
    linked_offer = models.ForeignKey("Offer", on_delete=models.SET_NULL, null=True, blank=True, related_name="messages")
    is_flagged = models.BooleanField(default=False)
    flag_reason = models.CharField(max_length=200, blank=True)
    is_deleted = models.BooleanField(default=False)

    # Ops review of a flagged message — set once someone has looked at it.
    # Flagging never blocked delivery; this is purely a queue-management state.
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="reviewed_flagged_messages"
    )

    class Meta:
        ordering = ["created_at"]

    def save(self, *args, **kwargs):
        # Contact-info filter — flag but still deliver (admin sees flagged queue)
        if self.message_type == self.MsgType.TEXT and not self.is_flagged:
            for pattern in CONTACT_INFO_PATTERNS:
                if re.search(pattern, self.content, re.IGNORECASE):
                    self.is_flagged = True
                    self.flag_reason = f"Contact info pattern: {pattern}"
                    self.conversation.contact_info_detected = True
                    self.conversation.contact_info_flagged_at = timezone.now()
                    self.conversation.save(update_fields=["contact_info_detected", "contact_info_flagged_at"])
                    break
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.conversation}] {self.sender}: {self.content[:60]}"


# ---------------------------------------------------------------------------
# Offer — immutable price proposal. Counter-offer creates a new row.
# ---------------------------------------------------------------------------

class Offer(TimeStampedModel):
    """
    Immutable once created. Accepted offer is the sole dispute evidence.
    Counter-offer = new row with counter_of FK pointing at this one.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        COUNTERED = "countered", "Countered"
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"
        EXPIRED = "expired", "Expired"
        WITHDRAWN = "withdrawn", "Withdrawn"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(BookingConversation, on_delete=models.CASCADE, related_name="offers")
    proposed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="offers_made")

    # Terms — NEVER update these fields; create a new Offer instead
    fee_amount = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    performance_date = models.DateField()
    performance_duration_minutes = models.PositiveIntegerField(default=60)
    set_count = models.PositiveSmallIntegerField(default=1)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    responded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="offers_responded"
    )
    responded_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    counter_of = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="counters")

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Offer ₹{self.fee_amount} on {self.performance_date} [{self.status}]"


# ---------------------------------------------------------------------------
# BookingOrder — the escrow lifecycle. The heart of Marketplace B.
# ---------------------------------------------------------------------------

class BookingOrder(TimeStampedModel):
    """
    State machine: accepted → funded → in_progress → completed → released → settled
    Dispute suspends the 72h auto-release timer at the DB query level.
    Double-booking prevented by partial unique index on (artist, performance_date) where status not cancelled/refunded.
    """

    class Status(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        FUNDED = "funded", "Funded"
        IN_PROGRESS = "in_progress", "In Progress"
        COMPLETED = "completed", "Completed"
        RELEASED = "released", "Released"
        SETTLED = "settled", "Settled"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"
        PARTIALLY_REFUNDED = "partially_refunded", "Partially Refunded"
        DISPUTED = "disputed", "Disputed"

    TERMINAL = {Status.SETTLED, Status.CANCELLED, Status.REFUNDED, Status.PARTIALLY_REFUNDED}
    TRANSITIONS = {
        Status.ACCEPTED: [Status.FUNDED, Status.CANCELLED],
        Status.FUNDED: [Status.IN_PROGRESS, Status.COMPLETED, Status.REFUNDED, Status.PARTIALLY_REFUNDED, Status.DISPUTED],
        Status.IN_PROGRESS: [Status.COMPLETED, Status.DISPUTED],
        Status.COMPLETED: [Status.RELEASED],
        Status.RELEASED: [Status.SETTLED],
        Status.DISPUTED: [Status.COMPLETED, Status.REFUNDED, Status.PARTIALLY_REFUNDED],
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    offer = models.OneToOneField(Offer, on_delete=models.PROTECT, related_name="booking_order")
    organizer = models.ForeignKey(Organizer, on_delete=models.PROTECT, related_name="booking_orders")
    artist = models.ForeignKey("artists.Artist", on_delete=models.PROTECT, related_name="booking_orders")
    event = models.ForeignKey("events.Event", on_delete=models.SET_NULL, null=True, blank=True, related_name="booking_orders")

    status = models.CharField(max_length=25, choices=Status.choices, default=Status.ACCEPTED, db_index=True)

    # Financial — stored at transaction time, never re-derived from current rates
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2)
    tds_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0"))
    artist_payout = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")

    # Performance details — denormalised so Event edits don't affect settled orders
    performance_date = models.DateField(db_index=True)
    performance_duration_minutes = models.PositiveIntegerField(default=60)

    # Razorpay
    razorpay_order_id = models.CharField(max_length=60, blank=True, db_index=True)
    razorpay_payment_id = models.CharField(max_length=60, blank=True, db_index=True)

    # Timestamps
    funded_at = models.DateTimeField(null=True, blank=True)
    auto_release_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    settled_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.TextField(blank=True)

    # Celery task IDs (stored so we can revoke on dispute/cancel)
    auto_release_task_id = models.CharField(max_length=100, blank=True)
    kyc_nudge_task_id = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            # Fee math invariant: artist_payout + platform_fee + tds_amount = gross_amount
            # Enforced in Postgres; SQLite ignores complex CHECK but the clean() validates
            models.CheckConstraint(
                check=models.Q(
                    artist_payout__gte=models.F("gross_amount")
                    - models.F("platform_fee")
                    - models.F("tds_amount")
                    - Decimal("0.01")
                ) & models.Q(
                    artist_payout__lte=models.F("gross_amount")
                    - models.F("platform_fee")
                    - models.F("tds_amount")
                    + Decimal("0.01")
                ),
                name="booking_fee_math_check",
            )
        ]
        indexes = [
            models.Index(fields=["artist", "performance_date"], name="booking_artist_date_idx"),
        ]

    def __str__(self):
        return f"BookingOrder {self.id} [{self.status}]"

    def clean(self):
        from django.core.exceptions import ValidationError
        expected = self.gross_amount - self.platform_fee - self.tds_amount
        if abs(self.artist_payout - expected) > Decimal("0.01"):
            raise ValidationError(
                f"Fee math error: artist_payout ({self.artist_payout}) + platform_fee ({self.platform_fee}) "
                f"+ tds ({self.tds_amount}) ≠ gross ({self.gross_amount})"
            )

    def can_transition_to(self, new_status):
        return new_status in self.TRANSITIONS.get(self.status, [])

    def transition(self, new_status, actor=None, reason="", ip=None):
        if not self.can_transition_to(new_status):
            raise ValueError(f"Cannot transition BookingOrder from {self.status} → {new_status}")
        old_status = self.status
        now = timezone.now()
        self.status = new_status
        if new_status == self.Status.FUNDED:
            self.funded_at = now
            self.auto_release_at = now + timezone.timedelta(hours=72)
        elif new_status == self.Status.COMPLETED:
            self.completed_at = now
        elif new_status == self.Status.RELEASED:
            self.released_at = now
        elif new_status == self.Status.SETTLED:
            self.settled_at = now
        elif new_status == self.Status.CANCELLED:
            self.cancelled_at = now
            self.cancellation_reason = reason
        self.save()
        BookingAuditLog.objects.create(
            booking_order=self, actor=actor,
            previous_status=old_status, new_status=new_status,
            note=reason, ip_address=ip,
        )
        return self

    def is_double_booked(self):
        """Check if artist already has a confirmed booking on this performance_date."""
        return BookingOrder.objects.filter(
            artist=self.artist,
            performance_date=self.performance_date,
            status__in=[
                self.Status.ACCEPTED, self.Status.FUNDED,
                self.Status.IN_PROGRESS, self.Status.COMPLETED,
                self.Status.RELEASED, self.Status.SETTLED,
            ]
        ).exclude(pk=self.pk).exists()


# ---------------------------------------------------------------------------
# Transfer — Razorpay Route on_hold record (one per booking)
# ---------------------------------------------------------------------------

class Transfer(TimeStampedModel):
    """Razorpay Route transfer. on_hold=True until host confirms or 72h timer fires."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_order = models.ForeignKey(BookingOrder, on_delete=models.PROTECT, related_name="transfers")
    razorpay_transfer_id = models.CharField(max_length=60, unique=True, db_index=True)
    razorpay_payment_id = models.CharField(max_length=60)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    on_hold = models.BooleanField(default=True)
    hold_released_at = models.DateTimeField(null=True, blank=True)
    recipient_account_id = models.CharField(max_length=60)  # Razorpay Linked Account ID
    status = models.CharField(
        max_length=20,
        choices=[("created", "Created"), ("processed", "Processed"), ("reversed", "Reversed")],
        default="created"
    )
    raw_response = models.JSONField(default=dict)

    def __str__(self):
        return f"Transfer {self.razorpay_transfer_id} on_hold={self.on_hold}"


# ---------------------------------------------------------------------------
# LedgerEntry — every fee stored at transaction time. Sums to zero per booking.
# ---------------------------------------------------------------------------

class LedgerEntry(TimeStampedModel):
    """
    Double-entry style ledger for every money movement on a booking.
    Sum of all entries per booking_order should net to zero.
    Never re-derive from current platform rates — always read from here.
    """

    class EntryType(models.TextChoices):
        GROSS_CHARGE = "gross_charge", "Gross Charge (from host)"
        PLATFORM_FEE = "platform_fee", "Platform Fee (retained)"
        TDS = "tds", "TDS Deducted"
        ARTIST_PAYOUT = "artist_payout", "Artist Payout"
        REFUND_HOST = "refund_host", "Refund to Host"
        REVERSAL = "reversal", "Razorpay Reversal"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_order = models.ForeignKey(BookingOrder, on_delete=models.PROTECT, related_name="ledger_entries")
    entry_type = models.CharField(max_length=30, choices=EntryType.choices, db_index=True)
    # Positive = credit to platform, negative = debit (payout/refund)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    description = models.CharField(max_length=200, blank=True)
    reference_id = models.CharField(max_length=60, blank=True)  # Razorpay ID

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.entry_type}] ₹{self.amount} | {self.booking_order_id}"


# ---------------------------------------------------------------------------
# BookingReview — each side rates the other once the gig is done
# ---------------------------------------------------------------------------

class BookingReview(TimeStampedModel):
    """A rating one party leaves the other for a finished booking.

    At most one per direction per booking: the venue rates the artist, the
    artist rates the venue. Immutable once left — a rating that can be
    rewritten after a dispute is not evidence of anything.
    """

    class Direction(models.TextChoices):
        HOST_TO_ARTIST = "host_to_artist", "Host reviewed artist"
        ARTIST_TO_HOST = "artist_to_host", "Artist reviewed host"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_order = models.ForeignKey(BookingOrder, on_delete=models.CASCADE, related_name="reviews")
    reviewer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="booking_reviews")
    direction = models.CharField(max_length=20, choices=Direction.choices)
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    body = models.TextField(blank=True, max_length=1000)

    class Meta:
        unique_together = [("booking_order", "direction")]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.direction} {self.rating}/5 on {self.booking_order_id}"


# ---------------------------------------------------------------------------
# Dispute — raises a flag, suspends 72h auto-release at the DB query level
# ---------------------------------------------------------------------------

class Dispute(TimeStampedModel):
    """
    One per BookingOrder. The auto_release task checks status=disputed and skips.
    Admin resolves by setting resolution + triggering the appropriate action.
    """

    class Resolution(models.TextChoices):
        PENDING = "pending", "Pending Admin Review"
        RELEASE = "release", "Release to Artist"
        REFUND = "refund", "Full Refund to Host"
        SPLIT = "split", "Split (partial release / partial refund)"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_order = models.OneToOneField(BookingOrder, on_delete=models.CASCADE, related_name="dispute")
    raised_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, related_name="disputes_raised"
    )
    reason = models.TextField()
    evidence_urls = models.JSONField(default=list, blank=True)

    resolution = models.CharField(max_length=20, choices=Resolution.choices, default=Resolution.PENDING)
    split_artist_pct = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True,
                                           help_text="Pct of gross going to artist (0-100). Used when resolution=split.")
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name="disputes_resolved"
    )
    resolved_at = models.DateTimeField(null=True, blank=True)
    admin_notes = models.TextField(blank=True)

    def __str__(self):
        return f"Dispute on {self.booking_order} [{self.resolution}]"


# ---------------------------------------------------------------------------
# BookingAuditLog — immutable trail of every state change
# ---------------------------------------------------------------------------

class BookingAuditLog(TimeStampedModel):
    """Append-only log. Never delete or update rows. Used for dispute evidence."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    booking_order = models.ForeignKey(BookingOrder, on_delete=models.CASCADE, related_name="audit_logs")
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    previous_status = models.CharField(max_length=25, blank=True)
    new_status = models.CharField(max_length=25, blank=True)
    note = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.booking_order_id}] {self.previous_status} → {self.new_status}"
