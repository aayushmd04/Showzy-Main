import uuid
from django.db import models
from django.conf import settings
from apps.core.models import TimeStampedModel


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
    qr_image = models.ImageField(upload_to="tickets/qr/%Y/%m/", null=True, blank=True)

    holder_name = models.CharField(max_length=120, blank=True)
    holder_email = models.EmailField(blank=True)
    holder_phone = models.CharField(max_length=20, blank=True)

    seat_label = models.CharField(max_length=20, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices,
                              default=Status.VALID, db_index=True)

    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                      null=True, blank=True, related_name="checked_in_tickets")
    scan_location = models.CharField(max_length=80, blank=True,
                                     help_text="Gate / entry point label")

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

    def generate_qr_image(self):
        import qrcode
        import io
        from django.core.files.base import ContentFile

        qr = qrcode.QRCode(version=1, box_size=10, border=4,
                            error_correction=qrcode.constants.ERROR_CORRECT_H)
        qr.add_data(str(self.qr_data))
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = io.BytesIO()
        img.save(buffer, format="PNG")
        self.qr_image.save(
            f"ticket_{self.ticket_number}.png",
            ContentFile(buffer.getvalue()),
            save=False
        )


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
