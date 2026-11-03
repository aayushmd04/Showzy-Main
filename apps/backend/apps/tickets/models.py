import uuid
from django.db import models
from django.conf import settings
from django.utils import timezone
from apps.core.models import TimeStampedModel


#: The most tickets one checkout can hold, across every tier in it. A bigger
#: group is a conversation with the venue, not a cart; it also bounds how much
#: inventory one abandoned checkout can lock up for the ten-minute hold.
MAX_TICKETS_PER_ORDER = 10


class TierType(models.TextChoices):
    GENERAL = "general", "General Admission"
    VIP = "vip", "VIP"
    EARLY_BIRD = "early_bird", "Early Bird"
    GROUP = "group", "Group"
    COMPLIMENTARY = "comp", "Complimentary"
    BACKSTAGE = "backstage", "Backstage Pass"


class TicketTier(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="ticket_tiers")
    name = models.CharField(max_length=100)
    name_kn = models.CharField(max_length=100, blank=True)
    description = models.CharField(max_length=300, blank=True)
    tier_type = models.CharField(max_length=20, choices=TierType.choices, default=TierType.GENERAL)
    benefits = models.JSONField(default=list, blank=True, help_text="List of perk strings")

    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_quantity = models.PositiveIntegerField()
    sold_quantity = models.PositiveIntegerField(default=0, db_index=True)
    reserved_quantity = models.PositiveIntegerField(default=0,
                                                     help_text="Held in active carts")
    min_per_order = models.PositiveSmallIntegerField(default=1)
    max_per_order = models.PositiveSmallIntegerField(default=10)

    sale_start_datetime = models.DateTimeField(null=True, blank=True)
    sale_end_datetime = models.DateTimeField(null=True, blank=True)

    is_active = models.BooleanField(default=True, db_index=True)
    is_visible = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "price"]
        indexes = [models.Index(fields=["event", "is_active"])]

    def __str__(self):
        return f"{self.name} — {self.event.title}"

    @property
    def available_quantity(self):
        return max(0, self.total_quantity - self.sold_quantity - self.reserved_quantity)

    @property
    def is_sold_out(self):
        return self.available_quantity == 0


class PromoCode(TimeStampedModel):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "pct", "Percentage"
        FIXED = "fixed", "Fixed Amount"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                              null=True, blank=True, related_name="promo_codes",
                              help_text="Null = platform-wide code")
    code = models.CharField(max_length=30, db_index=True)
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices)
    discount_value = models.DecimalField(max_digits=10, decimal_places=2)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_uses = models.PositiveIntegerField(null=True, blank=True, help_text="Null = unlimited")
    used_count = models.PositiveIntegerField(default=0)
    valid_from = models.DateTimeField()
    valid_until = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="+")

    class Meta:
        indexes = [models.Index(fields=["code", "is_active"])]

    def __str__(self):
        return self.code


class Order(TimeStampedModel):
    class Status(models.TextChoices):
        INITIATED = "initiated", "Initiated"
        PAYMENT_PENDING = "payment_pending", "Payment Pending"
        CONFIRMED = "confirmed", "Confirmed"
        PARTIALLY_CANCELLED = "partially_cancelled", "Partially Cancelled"
        FULLY_CANCELLED = "fully_cancelled", "Fully Cancelled"
        REFUNDED = "refunded", "Refunded"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                             related_name="orders")
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="orders")
    promo_code = models.ForeignKey(PromoCode, on_delete=models.SET_NULL,
                                   null=True, blank=True, related_name="orders")
    status = models.CharField(max_length=25, choices=Status.choices,
                              default=Status.INITIATED, db_index=True)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    taxes = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    payment_method = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True,
                                      help_text="Cart hold expiry — 15 min from creation")
    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["user", "status"]),
                   models.Index(fields=["event", "status"])]

    def __str__(self):
        return f"Order {str(self.id)[:8]} — {self.event.title}"


class OrderItem(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    tier = models.ForeignKey(TicketTier, on_delete=models.PROTECT, related_name="order_items")
    quantity = models.PositiveSmallIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ACTIVE)

    def __str__(self):
        return f"{self.quantity}× {self.tier.name}"


class Ticket(TimeStampedModel):
    class Status(models.TextChoices):
        VALID = "valid", "Valid"
        USED = "used", "Used / Checked In"
        CANCELLED = "cancelled", "Cancelled"
        TRANSFERRED = "transferred", "Transferred"
        EXPIRED = "expired", "Expired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="tickets")
    order_item = models.ForeignKey(OrderItem, on_delete=models.PROTECT, related_name="tickets")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                             related_name="tickets")
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="tickets")
    tier = models.ForeignKey(TicketTier, on_delete=models.PROTECT, related_name="tickets")

    ticket_number = models.CharField(max_length=20, unique=True, db_index=True)
    qr_data = models.UUIDField(default=uuid.uuid4, unique=True, db_index=True,
                                help_text="Signed UUID embedded in QR code")
    # Legacy: QR images are no longer stored (see ``qr_png_bytes``). The column
    # stays so old rows can be cleaned by migration 0008 without a table rewrite.
    qr_image = models.ImageField(upload_to="tickets/qr/%Y/%m/", null=True, blank=True, editable=False)

    holder_name = models.CharField(max_length=120, blank=True)
    holder_email = models.EmailField(blank=True)
    holder_phone = models.CharField(max_length=20, blank=True)

    # Where in the room this ticket sits, copied from the order's zone
    # allocation when one was chosen. 40 characters because it holds a
    # host-authored zone label ("Balcony Left — Table 3"), not a seat number.
    seat_label = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices,
                              default=Status.VALID, db_index=True)

    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="checked_in_tickets")
    scan_location = models.CharField(max_length=80, blank=True,
                                     help_text="Gate / entry point label")

    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancellation_reason = models.CharField(max_length=200, blank=True)

    transfer_count = models.PositiveSmallIntegerField(default=0)
    original_purchaser = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                           null=True, related_name="originally_purchased_tickets")

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["event", "status"]),
                   models.Index(fields=["user"]),
                   models.Index(fields=["qr_data"])]

    def __str__(self):
        return f"Ticket #{self.ticket_number} — {self.event.title}"

    def save(self, *args, **kwargs):
        """Stamp the order's chosen zone onto the ticket as it is issued.

        Tickets are created in one place (payment confirmation) and the buyer's
        zone is a property of the order, so deriving it here means door staff
        get "VIP Section" on the ticket without every caller having to remember
        to pass it. Only ever fills a blank label, so an explicitly set one —
        or a later `save(update_fields=...)` — is left alone.
        """
        if not self.seat_label and self.order_id and not kwargs.get("update_fields"):
            allocation = ZoneAllocation.objects.filter(
                order_id=self.order_id, status=ZoneAllocation.Status.HELD
            ).first()
            if allocation:
                self.seat_label = allocation.zone_label[:40]
        super().save(*args, **kwargs)

    def qr_png_bytes(self) -> bytes:
        """The entry QR, rendered on demand.

        The QR *is* the credential the door accepts, so it must never be written
        to public media: it used to be saved as ``tickets/qr/<yyyy>/<mm>/ticket_<number>.png``,
        a guessable path served without authentication. Callers hand it only to
        the ticket's current holder (see ``TicketSerializer.get_qr_image_url``).
        """
        import io

        import qrcode

        qr = qrcode.QRCode(version=1, box_size=10, border=4,
                           error_correction=qrcode.constants.ERROR_CORRECT_H)
        qr.add_data(str(self.qr_data))
        qr.make(fit=True)
        buffer = io.BytesIO()
        qr.make_image(fill_color="black", back_color="white").save(buffer, format="PNG")
        return buffer.getvalue()

    def qr_data_uri(self) -> str:
        import base64

        return "data:image/png;base64," + base64.b64encode(self.qr_png_bytes()).decode("ascii")


class ZoneAllocation(TimeStampedModel):
    """One order's claim on one labelled area of the venue's floor plan.

    Deliberately a row per order rather than a counter on the zone: a zone is
    not a database object at all — it is an element in host-authored JSON that
    can be renamed, resized or deleted between one gig and the next. Storing
    the claim against the order, with the label and capacity as they stood at
    booking time, means a redrawn floor plan can never silently rewrite what
    somebody already bought.

    Availability is therefore derived (see `zones.taken_by_zone`) rather than
    stored, so there is no counter to drift out of step with reality.
    """

    class Status(models.TextChoices):
        HELD = "held", "Held"
        RELEASED = "released", "Released"

    order = models.OneToOneField(Order, on_delete=models.CASCADE,
                                 related_name="zone_allocation")
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                              related_name="zone_allocations")
    zone_id = models.CharField(max_length=64, db_index=True,
                               help_text="Element id from Venue.layout")
    zone_label = models.CharField(max_length=40)
    zone_type = models.CharField(max_length=30, blank=True)
    quantity = models.PositiveSmallIntegerField(default=1,
                                                help_text="Places claimed in this zone")
    capacity_at_booking = models.PositiveIntegerField(default=0)
    seat_ids = models.JSONField(
        default=list, blank=True,
        help_text="Specific seats claimed, snapshotted as {id,label,furniture} at booking time")
    baby_chairs = models.PositiveSmallIntegerField(
        default=0, help_text="Free baby/high chairs reserved alongside the seats")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.HELD)
    released_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["event", "zone_id", "status"])]

    def __str__(self):
        return f"{self.quantity}× {self.zone_label} (order {str(self.order_id)[:8]})"

    def release(self):
        """Hand the places back. Idempotent — a second sweep is a no-op."""
        if self.status == self.Status.RELEASED:
            return False
        self.status = self.Status.RELEASED
        self.released_at = timezone.now()
        self.save(update_fields=["status", "released_at", "updated_at"])
        return True


class TicketTransfer(TimeStampedModel):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="transfers")
    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                  related_name="ticket_transfers_sent")
    to_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT,
                                related_name="ticket_transfers_received")
    transfer_reason = models.CharField(max_length=200, blank=True)
    is_reverted = models.BooleanField(default=False)
    reverted_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Transfer of {self.ticket} from {self.from_user} → {self.to_user}"


class GateAssignment(TimeStampedModel):
    """A *Gatekeeper*: someone a host has trusted to check tickets at ONE event.

    This is deliberately not a role on the user. A gatekeeper is an ordinary
    account; what they may do — scan tickets and read the narrow door list for
    this one event, inside a time window around it — lives entirely on this row.
    Nothing here grants any access to the venue, its money, its other events or
    the host console.

    Lifecycle: the host invites by email or phone (``pending``); the person
    signs in with their own account and accepts (``active``) or declines. The
    host can revoke at any time, which takes effect on the very next scan.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Invited"
        ACTIVE = "active", "Active"
        DECLINED = "declined", "Declined"
        REVOKED = "revoked", "Revoked"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE,
                              related_name="gate_assignments")
    invited_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                   null=True, related_name="gate_invites_sent")
    # How the host named the person. The account that accepts is `user`.
    invitee_email = models.EmailField(blank=True)
    invitee_phone = models.CharField(max_length=15, blank=True)
    label = models.CharField(max_length=60, blank=True, help_text="e.g. 'Main gate'")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             null=True, blank=True, related_name="gate_assignments")
    status = models.CharField(max_length=10, choices=Status.choices,
                              default=Status.PENDING, db_index=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["event", "status"]),
                   models.Index(fields=["user", "status"])]
        ordering = ["created_at"]

    def __str__(self):
        return f"{self.invitee_email or self.invitee_phone} @ {self.event_id} [{self.status}]"
