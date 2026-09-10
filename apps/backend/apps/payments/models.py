import uuid
from django.db import models
from django.conf import settings
from apps.core.models import TimeStampedModel


class Gateway(models.TextChoices):
    RAZORPAY = "razorpay", "Razorpay"
    UPI = "upi", "UPI (Direct)"
    CASH = "cash", "Cash at Door"
    COMPLIMENTARY = "comp", "Complimentary"


class PaymentStatus(models.TextChoices):
    INITIATED = "initiated", "Initiated"
    PROCESSING = "processing", "Processing"
    SUCCESS = "success", "Success"
    FAILED = "failed", "Failed"
    CANCELLED = "cancelled", "Cancelled"
    REFUNDED = "refunded", "Refunded"
    PARTIALLY_REFUNDED = "partial_refund", "Partially Refunded"


class Payment(TimeStampedModel):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey("tickets.Order", on_delete=models.PROTECT, related_name="payments")
    gateway = models.CharField(max_length=20, choices=Gateway.choices)

    # Gateway-specific IDs
    gateway_payment_id = models.CharField(max_length=100, blank=True, db_index=True,
                                           help_text="e.g. pay_XXXXXXXXXX from Razorpay")
    gateway_order_id = models.CharField(max_length=100, blank=True,
                                        help_text="e.g. order_XXXXXXXXXX from Razorpay")
    gateway_signature = models.CharField(max_length=200, blank=True,
                                         help_text="HMAC-SHA256 signature for verification")

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="INR")
    status = models.CharField(max_length=20, choices=PaymentStatus.choices,
                              default=PaymentStatus.INITIATED, db_index=True)
    failure_reason = models.TextField(blank=True)
    gateway_response = models.JSONField(default=dict, blank=True,
                                        help_text="Raw response from gateway")
    metadata = models.JSONField(default=dict, blank=True,
                                help_text="Any extra context e.g. UTR for UPI")

    initiated_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    device_type = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ["-initiated_at"]
        indexes = [models.Index(fields=["gateway_payment_id"]),
                   models.Index(fields=["order", "status"])]

    def __str__(self):
        return f"Payment {str(self.id)[:8]} — {self.status} ({self.gateway})"


class Refund(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        PROCESSING = "processing", "Processing"
        SUCCESS = "success", "Success"
        FAILED = "failed", "Failed"

    class Reason(models.TextChoices):
        EVENT_CANCELLED = "event_cancelled", "Event Cancelled"
        USER_REQUEST = "user_request", "User Request"
        DUPLICATE = "duplicate", "Duplicate Payment"
        FRAUD = "fraud", "Fraud Prevention"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    order = models.ForeignKey("tickets.Order", on_delete=models.PROTECT, related_name="refunds")
    ticket = models.ForeignKey("tickets.Ticket", on_delete=models.SET_NULL,
                               null=True, blank=True, related_name="refunds",
                               help_text="Null = full order refund")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=20, choices=Reason.choices)
    reason_detail = models.TextField(blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    gateway_refund_id = models.CharField(max_length=100, blank=True, db_index=True)
    gateway_response = models.JSONField(default=dict, blank=True)
    initiated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
                                     null=True, related_name="initiated_refunds")
    processed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Refund ₹{self.amount} for Order {str(self.order.id)[:8]}"


class PaymentWebhook(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    gateway = models.CharField(max_length=20, choices=Gateway.choices)
    event_id = models.CharField(
        max_length=120, blank=True, db_index=True,
        help_text="Gateway delivery id (X-Razorpay-Event-Id) — used for idempotency",
    )
    event_type = models.CharField(max_length=80)
    payload = models.JSONField()
    signature = models.CharField(max_length=200, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)
    is_processed = models.BooleanField(default=False, db_index=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processing_error = models.TextField(blank=True)

    class Meta:
        ordering = ["-received_at"]
        constraints = [
            # Razorpay retries deliveries; the same event id must never land twice.
            models.UniqueConstraint(
                fields=["gateway", "event_id"],
                condition=models.Q(event_id__gt=""),
                name="uniq_webhook_event_per_gateway",
            ),
        ]
