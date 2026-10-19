from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from django.utils.text import slugify
from rest_framework import serializers
from .models import (
    Organizer, Membership, GigApplication,
    BookingConversation, BookingMessage, Offer,
    BookingOrder, Transfer, LedgerEntry, Dispute, BookingAuditLog,
)

TDS_PCT = Decimal("0.01")  # 1% TDS (194-O — confirm with CA)


def platform_fee_pct() -> Decimal:
    """Showzy's fee on a booking, read from settings (PLATFORM_FEE_PCT, default 5%)."""
    return Decimal(str(settings.PLATFORM_FEE_PCT))


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
        # Nobody picks a URL slug for the venue they just named; make one.
        extra_kwargs = {"slug": {"required": False}}

    def create(self, validated_data):
        if not validated_data.get("slug"):
            validated_data["slug"] = self._unique_slug(validated_data.get("name", ""))
        return super().create(validated_data)

    @staticmethod
    def _unique_slug(name):
        base = slugify(name)[:40] or "organizer"
        slug, n = base, 2
        while Organizer.objects.filter(slug=slug).exists():
            slug = f"{base}-{n}"
            n += 1
        return slug


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
    event_title = serializers.CharField(source="event.title", read_only=True, default=None)
    latest_message = serializers.SerializerMethodField()
    # The offer currently waiting for an answer, if any. This is what an
    # artist's inbox needs to show "₹X for 14 Mar" and offer Accept / Counter /
    # Decline without a request per thread.
    pending_offer = serializers.SerializerMethodField()

    class Meta:
        model = BookingConversation
        fields = [
            "id", "organizer", "organizer_name", "artist", "artist_name",
            "event", "event_title", "is_active", "last_message_at", "latest_message",
            "pending_offer", "contact_info_detected", "created_at",
        ]
        read_only_fields = ["id", "last_message_at", "contact_info_detected", "created_at"]

    def get_pending_offer(self, obj):
        offer = obj.offers.filter(status=Offer.Status.PENDING).order_by("-created_at").first()
        return OfferSerializer(offer).data if offer else None

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
    agreed_amount = serializers.SerializerMethodField()

    class Meta:
        model = BookingOrder
        fields = [
            "id", "organizer", "organizer_name", "artist", "artist_name",
            "event", "event_title", "status",
            "agreed_amount",
            "gross_amount", "platform_fee", "tds_amount", "artist_payout", "currency",
            "performance_date", "performance_duration_minutes",
            "razorpay_order_id", "funded_at", "auto_release_at",
            "completed_at", "released_at", "settled_at", "cancelled_at",
            "cancellation_reason", "dispute_raised", "created_at",
        ]
        read_only_fields = fields

    def get_dispute_raised(self, obj):
        return hasattr(obj, "dispute")

    def get_agreed_amount(self, obj):
        """What the venue and artist agreed: what the venue pays, less Showzy's fee."""
        return str(obj.gross_amount - obj.platform_fee)


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
    # `raised_by` is the raw user id. An ops console reviewing a dispute needs
    # to say who raised it, and an email address alone reads badly in a
    # sentence — so send the name too, in the same flat style as the email.
    # `default=None` keeps the keys present when `raised_by` is NULL — it is
    # SET_NULL, so a user who exercises their right to erasure leaves the
    # dispute row behind with no account attached. Without the default, DRF
    # drops both keys from the payload entirely rather than sending null, and a
    # field that sometimes vanishes is a worse contract than one that is
    # sometimes empty.
    raised_by_email = serializers.EmailField(source="raised_by.email", read_only=True, default=None)
    raised_by_name = serializers.CharField(source="raised_by.full_name", read_only=True, default=None)

    class Meta:
        model = Dispute
        fields = [
            "id", "booking_order", "raised_by", "raised_by_email", "raised_by_name",
            "reason", "evidence_urls",
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


def compute_fees(agreed: Decimal):
    """Split a booking into (platform_fee, tds, artist_payout, gross).

    ``agreed`` is the fee the venue and artist settled on. Showzy's fee is added
    on top and paid by the venue; TDS is deducted from the artist's side. So:

        gross         = agreed + platform_fee      (what the venue pays)
        artist_payout = agreed - tds               (what the artist receives)

    and the ledger invariant still holds exactly:
        artist_payout + platform_fee + tds = gross
    """
    platform_fee = (agreed * platform_fee_pct()).quantize(Decimal("0.01"))
    tds = (agreed * TDS_PCT).quantize(Decimal("0.01"))
    artist_payout = agreed - tds
    gross = agreed + platform_fee
    return platform_fee, tds, artist_payout, gross
