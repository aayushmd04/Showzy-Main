import uuid
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class SoftDeleteModel(models.Model):
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    is_deleted = models.BooleanField(default=False, db_index=True)

    class Meta:
        abstract = True

    def soft_delete(self):
        from django.utils import timezone
        self.deleted_at = timezone.now()
        self.is_deleted = True
        self.save(update_fields=["deleted_at", "is_deleted"])


class KYCStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    SUBMITTED = "submitted", "Submitted"
    VERIFIED = "verified", "Verified"
    REJECTED = "rejected", "Rejected"


class PayoutDetailsMixin(models.Model):
    """GST/PAN, KYC status, and payout bank account — shared verbatim by
    `Artist` and `Venue`, since whoever actually receives money on this
    platform (an artist's booking fee, a venue's ticket-sale revenue) needs
    the identical compliance shape.

    The full account number is deliberately never put in any read serializer
    — only `bank_account_last4` is. Nothing here computes a Razorpay payout
    on its own; this is the data those tools will need once one exists.
    """

    gst_number = models.CharField(max_length=15, blank=True, help_text="GSTIN, if registered")
    pan_number = models.CharField(max_length=10, blank=True, help_text="PAN — required for TDS")

    kyc_status = models.CharField(max_length=20, choices=KYCStatus.choices, default=KYCStatus.PENDING)
    kyc_submitted_at = models.DateTimeField(null=True, blank=True)
    kyc_verified_at = models.DateTimeField(null=True, blank=True)
    kyc_rejection_reason = models.TextField(blank=True)

    bank_account_holder_name = models.CharField(max_length=120, blank=True)
    bank_account_number = models.CharField(max_length=34, blank=True)
    bank_ifsc_code = models.CharField(max_length=11, blank=True)
    bank_name = models.CharField(max_length=120, blank=True)
    bank_details_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        abstract = True

    @property
    def has_bank_details(self) -> bool:
        return bool(self.bank_account_number and self.bank_ifsc_code)

    @property
    def bank_account_last4(self) -> str:
        return self.bank_account_number[-4:] if self.bank_account_number else ""

    @property
    def can_receive_payouts(self) -> bool:
        """The real gate on ever sending this entity money — verified KYC
        and an actual account to send it to, not just one or the other."""
        return self.kyc_status == KYCStatus.VERIFIED and self.has_bank_details


class City(TimeStampedModel):
    name = models.CharField(max_length=80)
    name_kn = models.CharField(max_length=80, blank=True)
    slug = models.SlugField(unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "cities"
        ordering = ["name"]

    def __str__(self):
        return self.name


class Area(TimeStampedModel):
    city = models.ForeignKey(City, on_delete=models.CASCADE, related_name="areas")
    name = models.CharField(max_length=100)
    name_kn = models.CharField(max_length=100, blank=True)
    slug = models.SlugField()
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = [("city", "slug")]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name}, {self.city.name}"


class Genre(TimeStampedModel):
    name = models.CharField(max_length=60)
    name_kn = models.CharField(max_length=60, blank=True)
    slug = models.SlugField(unique=True)
    icon = models.CharField(max_length=10, blank=True)
    color = models.CharField(max_length=7, blank=True, help_text="Hex color e.g. #C4472E")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name
