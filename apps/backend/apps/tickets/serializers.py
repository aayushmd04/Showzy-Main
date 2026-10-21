from rest_framework import serializers
from .models import (
    TicketTier, Order, OrderItem, Ticket, PromoCode, TicketTransfer, ZoneAllocation,
)
from apps.events.serializers import EventListSerializer


class TicketTierSerializer(serializers.ModelSerializer):
    available_quantity = serializers.IntegerField(read_only=True)
    is_sold_out = serializers.BooleanField(read_only=True)

    class Meta:
        model = TicketTier
        fields = "__all__"


class TierWriteSerializer(serializers.ModelSerializer):
    """What an organiser may set on a ticket tier — never the stock counters."""

    class Meta:
        model = TicketTier
        fields = [
            "name", "description", "tier_type", "price", "total_quantity",
            "min_per_order", "max_per_order", "sale_start_datetime",
            "sale_end_datetime", "is_active", "is_visible", "sort_order",
        ]

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Give the ticket a name.")
        return value

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Price can't be negative.")
        return value

    def validate_total_quantity(self, value):
        if value < 1:
            raise serializers.ValidationError("Offer at least one ticket.")
        return value

    def validate(self, attrs):
        inst = self.instance
        total = attrs.get("total_quantity", inst.total_quantity if inst else None)
        # Never promise fewer tickets than are already sold or being held.
        if inst and total is not None and total < inst.sold_quantity + inst.reserved_quantity:
            raise serializers.ValidationError({
                "total_quantity": f"{inst.sold_quantity + inst.reserved_quantity} are already sold "
                                  "or being paid for, so you can't go below that."})
        lo = attrs.get("min_per_order", inst.min_per_order if inst else 1)
        hi = attrs.get("max_per_order", inst.max_per_order if inst else 10)
        if lo > hi:
            raise serializers.ValidationError({"max_per_order": "Maximum can't be below the minimum."})
        start = attrs.get("sale_start_datetime", inst.sale_start_datetime if inst else None)
        end = attrs.get("sale_end_datetime", inst.sale_end_datetime if inst else None)
        if start and end and end <= start:
            raise serializers.ValidationError({"sale_end_datetime": "Sales must end after they start."})
        return attrs


class OrderItemSerializer(serializers.ModelSerializer):
    tier_name = serializers.CharField(source="tier.name", read_only=True)
    tier_price = serializers.DecimalField(source="tier.price", max_digits=10,
                                          decimal_places=2, read_only=True)

    class Meta:
        model = OrderItem
        fields = ["id", "tier", "tier_name", "tier_price", "quantity",
                  "unit_price", "total_price", "status"]


class CreateOrderItemSerializer(serializers.Serializer):
    tier_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=10)


class CreateOrderSerializer(serializers.Serializer):
    event_id = serializers.UUIDField()
    items = CreateOrderItemSerializer(many=True)
    promo_code = serializers.CharField(required=False, allow_blank=True)
    # The floor-plan zone the buyer picked, if the venue has a floor plan and
    # they picked one. Absent means "seat me anywhere", which is how every
    # standing-room gig has always worked and must keep working.
    zone_id = serializers.CharField(required=False, allow_blank=True, max_length=64)
    # Specific seat ids within that zone, only meaningful (and only required)
    # when the zone itself has seats — see create_order's own validation.
    seat_ids = serializers.ListField(
        child=serializers.CharField(max_length=64), required=False, default=list)
    # Optional free add-on: baby/high chairs at the picked table, for guests
    # bringing a little one. Validated against the table's stock in create_order.
    baby_chairs = serializers.IntegerField(required=False, min_value=0, max_value=8, default=0)


class ZoneSerializer(serializers.Serializer):
    """One element of a venue floor plan, priced by availability rather than money."""

    id = serializers.CharField()
    label = serializers.CharField()
    type = serializers.CharField()
    x = serializers.FloatField()
    y = serializers.FloatField()
    w = serializers.FloatField()
    h = serializers.FloatField()
    capacity = serializers.IntegerField()
    bookable = serializers.BooleanField()
    taken = serializers.IntegerField()
    available = serializers.IntegerField()
    # Table-only fields, present (with harmless defaults) on every zone so the
    # frontend never has to branch on their absence.
    shape = serializers.CharField()
    seats = serializers.ListField(child=serializers.DictField(), default=list)
    # Facilities + the baby-chair add-on, always present so the client never branches on absence.
    count = serializers.IntegerField(default=0)
    baby_chairs_total = serializers.IntegerField(default=0)
    baby_chairs_available = serializers.IntegerField(default=0)


class ZoneAllocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ZoneAllocation
        fields = ["zone_id", "zone_label", "zone_type", "quantity", "baby_chairs", "status"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_date = serializers.DateTimeField(source="event.start_datetime", read_only=True)
    zone = serializers.SerializerMethodField()

    def get_zone(self, obj):
        allocation = getattr(obj, "zone_allocation", None)
        if not allocation or allocation.status != ZoneAllocation.Status.HELD:
            return None
        return ZoneAllocationSerializer(allocation).data

    class Meta:
        model = Order
        fields = [
            "id", "event", "event_title", "event_date", "status",
            "subtotal", "discount_amount", "platform_fee", "taxes", "total_amount",
            "currency", "payment_method", "items", "promo_code", "zone",
            "expires_at", "confirmed_at", "created_at",
        ]


class TicketSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_date = serializers.DateTimeField(source="event.start_datetime", read_only=True)
    venue_name = serializers.CharField(source="event.venue.name", read_only=True)
    tier_name = serializers.CharField(source="tier.name", read_only=True)
    tier_price = serializers.DecimalField(source="tier.price", max_digits=10,
                                          decimal_places=2, read_only=True)
    qr_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "order", "ticket_number", "qr_data", "qr_image_url",
            "event", "event_title", "event_date", "venue_name",
            "tier_name", "tier_price", "holder_name", "holder_email", "holder_phone",
            "seat_label", "status", "checked_in_at",
            "cancelled_at", "cancellation_reason", "transfer_count",
        ]

    def get_qr_image_url(self, obj):
        request = self.context.get("request")
        if obj.qr_image and request:
            return request.build_absolute_uri(obj.qr_image.url)
        return None


class TransferTicketSerializer(serializers.Serializer):
    recipient_email = serializers.EmailField()
    reason = serializers.CharField(required=False, allow_blank=True, max_length=200)


class PromoCodeValidateSerializer(serializers.Serializer):
    code = serializers.CharField()
    event_id = serializers.UUIDField()
    order_amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class AttendeeSerializer(serializers.ModelSerializer):
    """One row of an event's door list.

    Deliberately narrower than `TicketSerializer`: door staff need to find a
    person and admit them, not read the buyer's email address and phone
    number off a shared tablet. `qr_data` is here because admitting from the
    manual list goes through the same check-in endpoint the camera uses.
    """

    tier_name = serializers.CharField(source="tier.name", read_only=True)

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "qr_data", "holder_name",
            "tier_name", "seat_label", "status", "checked_in_at",
        ]
        read_only_fields = fields
