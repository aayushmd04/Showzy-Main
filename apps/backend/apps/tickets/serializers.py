from rest_framework import serializers
from .models import TicketTier, Order, OrderItem, Ticket, PromoCode, TicketTransfer
from apps.events.serializers import EventListSerializer


class TicketTierSerializer(serializers.ModelSerializer):
    available_quantity = serializers.IntegerField(read_only=True)
    is_sold_out = serializers.BooleanField(read_only=True)

    class Meta:
        model = TicketTier
        fields = "__all__"


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


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_date = serializers.DateTimeField(source="event.start_datetime", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id", "event", "event_title", "event_date", "status",
            "subtotal", "discount_amount", "platform_fee", "taxes", "total_amount",
            "currency", "payment_method", "items", "promo_code",
            "expires_at", "confirmed_at", "created_at",
        ]


class TicketSerializer(serializers.ModelSerializer):
    event_title = serializers.CharField(source="event.title", read_only=True)
    event_date = serializers.DateTimeField(source="event.start_datetime", read_only=True)
    venue_name = serializers.CharField(source="event.venue.name", read_only=True)
    tier_name = serializers.CharField(source="tier.name", read_only=True)
    qr_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            "id", "ticket_number", "qr_data", "qr_image_url",
            "event", "event_title", "event_date", "venue_name",
            "tier_name", "holder_name", "holder_email", "holder_phone",
            "seat_label", "status", "checked_in_at",
        ]

    def get_qr_image_url(self, obj):
        request = self.context.get("request")
        if obj.qr_image and request:
            return request.build_absolute_uri(obj.qr_image.url)
        return None


class PromoCodeValidateSerializer(serializers.Serializer):
    code = serializers.CharField()
    event_id = serializers.UUIDField()
    order_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
