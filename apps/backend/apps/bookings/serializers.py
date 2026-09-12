from decimal import Decimal
from django.utils import timezone
from rest_framework import serializers
from .models import (
    Organizer, Membership, GigApplication,
    BookingConversation, BookingMessage, Offer,
    BookingOrder, Transfer, LedgerEntry, Dispute, BookingAuditLog,
)

PLATFORM_FEE_PCT = Decimal("0.10")  # 10%
TDS_PCT = Decimal("0.01")           # 1% TDS (194-O — confirm with CA)


class OrganizerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Organizer
        fields = [
            "id", "name", "name_kn", "slug", "description", "organizer_type",
            "kyc_status", "kyc_submitted_at", "kyc_verified_at", "kyc_rejection_reason",
            "contact_email", "contact_phone", "website",
            "city", "address", "logo", "gst_number", "pan_number",
            "is_active", "is_verified", "can_book_artists", "created_at",
        ]
        read_only_fields = [
            "id", "kyc_status", "kyc_submitted_at", "kyc_verified_at", "kyc_rejection_reason",
            "is_verified", "can_book_artists", "created_at",
        ]


class MembershipSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)

    class Meta:
        model = Membership
        fields = ["id", "user", "user_email", "organizer", "organizer_name", "role", "is_active", "created_at"]
        read_only_fields = ["id", "user", "created_at"]


class GigApplicationSerializer(serializers.ModelSerializer):
    artist_name = serializers.CharField(source="artist.stage_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)

    class Meta:
        model = GigApplication
        fields = [
            "id", "event", "event_title", "artist", "artist_name",
            "proposed_fee", "note", "status", "reviewed_at", "created_at",
        ]
        read_only_fields = ["id", "status", "reviewed_at", "created_at"]


class BookingMessageSerializer(serializers.ModelSerializer):
    sender_name = serializers.CharField(source="sender.name", read_only=True)
    flag_reason = serializers.CharField(read_only=True)
    reviewed_by_name = serializers.CharField(source="reviewed_by.name", read_only=True, default=None)
    organizer_name = serializers.CharField(source="conversation.organizer.name", read_only=True, default=None)
    artist_name = serializers.CharField(source="conversation.artist.stage_name", read_only=True, default=None)
    event_title = serializers.CharField(source="conversation.event.title", read_only=True, default=None)
    conversation_id = serializers.UUIDField(read_only=True)

    class Meta:
        model = BookingMessage
        fields = [
            "id", "sender", "sender_name", "content", "message_type", "linked_offer",
            "is_flagged", "flag_reason", "reviewed_at", "reviewed_by_name",
            "conversation_id", "organizer_name", "artist_name", "event_title",
            "created_at",
        ]
        read_only_fields = ["id", "sender", "is_flagged", "flag_reason", "reviewed_at", "created_at"]


class BookingConversationSerializer(serializers.ModelSerializer):
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)
    artist_name = serializers.CharField(source="artist.stage_name", read_only=True)
    latest_message = serializers.SerializerMethodField()

    class Meta:
        model = BookingConversation
        fields = [
            "id", "organizer", "organizer_name", "artist", "artist_name",
            "event", "is_active", "last_message_at", "latest_message",
            "contact_info_detected", "created_at",
        ]
        read_only_fields = ["id", "last_message_at", "contact_info_detected", "created_at"]

    def get_latest_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).last()
        if msg:
            return {"content": msg.content[:100], "sender": str(msg.sender_id)}
        return None


class OfferSerializer(serializers.ModelSerializer):
    proposed_by_name = serializers.CharField(source="proposed_by.name", read_only=True)
    counter_of_id = serializers.UUIDField(source="counter_of.id", read_only=True, allow_null=True)

    class Meta:
        model = Offer
        fields = [
            "id", "conversation", "proposed_by", "proposed_by_name",
            "fee_amount", "currency", "performance_date", "performance_duration_minutes",
            "set_count", "notes", "status", "responded_at", "expires_at",
            "counter_of_id", "created_at",
        ]
        read_only_fields = [
            "id", "proposed_by", "proposed_by_name", "status",
            "responded_at", "counter_of_id", "created_at",
        ]


class BookingOrderSerializer(serializers.ModelSerializer):
    organizer_name = serializers.CharField(source="organizer.name", read_only=True)
    artist_name = serializers.CharField(source="artist.stage_name", read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True, allow_null=True)
    dispute_raised = serializers.SerializerMethodField()

    class Meta:
        model = BookingOrder
        fields = [
            "id", "organizer", "organizer_name", "artist", "artist_name",
            "event", "event_title", "status",
            "gross_amount", "platform_fee", "tds_amount", "artist_payout", "currency",
            "performance_date", "performance_duration_minutes",
            "razorpay_order_id", "funded_at", "auto_release_at",
            "completed_at", "released_at", "settled_at", "cancelled_at",
            "cancellation_reason", "dispute_raised", "created_at",
        ]
        read_only_fields = fields

    def get_dispute_raised(self, obj):
        return hasattr(obj, "dispute")


class LedgerEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = LedgerEntry
        fields = ["id", "entry_type", "amount", "currency", "description", "reference_id", "created_at"]


class AdminLedgerEntrySerializer(serializers.ModelSerializer):
    """Same rows as `LedgerEntrySerializer`, with the booking context an
    ops-wide view needs — which the per-order endpoint can omit since the
    caller already knows which order they're looking at."""

    booking_order_id = serializers.UUIDField(read_only=True)
    organizer_name = serializers.CharField(source="booking_order.organizer.name", read_only=True)
    artist_name = serializers.CharField(source="booking_order.artist.stage_name", read_only=True)
    event_title = serializers.CharField(
        source="booking_order.event.title", read_only=True, default=None, allow_null=True
    )

    class Meta:
        model = LedgerEntry
        fields = [
            "id", "entry_type", "amount", "currency", "description", "reference_id",
            "booking_order_id", "organizer_name", "artist_name", "event_title", "created_at",
        ]


class DisputeSerializer(serializers.ModelSerializer):
    raised_by_email = serializers.EmailField(source="raised_by.email", read_only=True)

    class Meta:
        model = Dispute
        fields = [
            "id", "booking_order", "raised_by", "raised_by_email", "reason", "evidence_urls",
            "resolution", "split_artist_pct", "resolved_at", "admin_notes", "created_at",
        ]
        read_only_fields = ["id", "raised_by", "resolution", "split_artist_pct", "resolved_at", "created_at"]


class FundOrderSerializer(serializers.Serializer):
    """Input for POST /orders/<id>/fund/"""
    razorpay_payment_id = serializers.CharField(max_length=60)
    razorpay_order_id = serializers.CharField(max_length=60)
    razorpay_signature = serializers.CharField(max_length=200)


class MakeOfferSerializer(serializers.Serializer):
    fee_amount = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("1"))
    performance_date = serializers.DateField()
    performance_duration_minutes = serializers.IntegerField(default=60, min_value=15, max_value=480)
    set_count = serializers.IntegerField(default=1, min_value=1, max_value=10)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    counter_of = serializers.UUIDField(required=False, allow_null=True)


def compute_fees(gross: Decimal):
    """Return (platform_fee, tds, artist_payout) — fee math must always sum to gross."""
    platform_fee = (gross * PLATFORM_FEE_PCT).quantize(Decimal("0.01"))
    tds = (gross * TDS_PCT).quantize(Decimal("0.01"))
    artist_payout = gross - platform_fee - tds
    return platform_fee, tds, artist_payout
