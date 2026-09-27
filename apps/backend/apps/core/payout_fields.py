"""Shared GST/PAN/bank-details serializer plumbing for `Artist` and `Venue`.

Both models carry the identical compliance shape via `PayoutDetailsMixin`
(see `apps/core/models.py`), and both need the identical validation and
save-time behaviour on their write serializers, so it lives here once.
"""
import re

from django.utils import timezone
from rest_framework import serializers

from .models import KYCStatus

GST_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
IFSC_RE = re.compile(r"^[A-Z]{4}0[A-Z\d]{6}$")

#: Never writable by the entity itself — see each app's `.../kyc/` admin action.
PAYOUT_READ_ONLY_FIELDS = [
    "kyc_status", "kyc_submitted_at", "kyc_verified_at", "kyc_rejection_reason",
    "bank_details_updated_at",
]

#: Never *read* by anyone but the entity's own owner or staff — GSTIN, PAN,
#: KYC status/history, and everything about the bank account except the
#: recognisable last 4 digits (`bank_account_last4`, which stays public).
#: These are real government tax IDs and bank details; a detail serializer
#: built with `Meta.exclude` includes every one of them by default, so this
#: list exists to be stripped back out for anyone who isn't privileged.
PAYOUT_PRIVATE_FIELDS = [
    "gst_number", "pan_number",
    "kyc_status", "kyc_submitted_at", "kyc_verified_at", "kyc_rejection_reason",
    "bank_account_holder_name", "bank_ifsc_code", "bank_name", "bank_details_updated_at",
]


class PayoutDetailReadMixin:
    """Mixed into a read serializer for `Artist`/`Venue` (built with
    `Meta.exclude`, so every new `PayoutDetailsMixin` field is included by
    default) to strip the private ones back out for anyone but the entity's
    own owner or staff. Subclasses implement `_is_payout_owner`.
    """

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_privileged = bool(user and user.is_authenticated and (
            user.is_staff or self._is_payout_owner(instance, user)
        ))
        if not is_privileged:
            for field in PAYOUT_PRIVATE_FIELDS:
                data.pop(field, None)
        return data

    def _is_payout_owner(self, instance, user) -> bool:
        raise NotImplementedError


class PayoutFieldsMixin:
    """Mixed into a `ModelSerializer` for the write (create/update) path.

    Not a `Serializer` subclass itself — a plain mixin of validators and a
    save-time helper. `bank_account_number` still needs declaring directly
    on each concrete serializer (`write_only=True`) since DRF collects
    declared fields from the class body, not from an arbitrary mixin.
    """

    def validate_gst_number(self, value):
        value = (value or "").strip().upper()
        if value and not GST_RE.match(value):
            raise serializers.ValidationError("That doesn't look like a valid 15-character GSTIN.")
        return value

    def validate_pan_number(self, value):
        value = (value or "").strip().upper()
        if value and not PAN_RE.match(value):
            raise serializers.ValidationError("That doesn't look like a valid 10-character PAN.")
        return value

    def validate_bank_ifsc_code(self, value):
        value = (value or "").strip().upper()
        if value and not IFSC_RE.match(value):
            raise serializers.ValidationError("That doesn't look like a valid 11-character IFSC code.")
        return value

    def apply_payout_side_effects(self, instance, validated_data) -> list[str]:
        """Call after copying `validated_data` onto `instance`, before
        saving it. Stamps `bank_details_updated_at` when a bank field
        actually changed, and moves a still-pending KYC to "submitted" the
        moment there's something for an admin to actually review — an
        entity that never gave GST/PAN/bank details never needs a human to
        look at it. Returns the field names it touched, to fold into the
        caller's own `update_fields`.
        """
        touched = []
        bank_fields = {"bank_account_holder_name", "bank_account_number", "bank_ifsc_code", "bank_name"}
        if bank_fields & set(validated_data.keys()):
            instance.bank_details_updated_at = timezone.now()
            touched.append("bank_details_updated_at")

        if instance.kyc_status == KYCStatus.PENDING and (
            instance.has_bank_details or instance.gst_number or instance.pan_number
        ):
            instance.kyc_status = KYCStatus.SUBMITTED
            instance.kyc_submitted_at = timezone.now()
            touched += ["kyc_status", "kyc_submitted_at"]

        return touched
