from rest_framework import serializers
from .models import TicketTier


class TicketTierLightSerializer(serializers.ModelSerializer):
    available_quantity = serializers.IntegerField(read_only=True)
    is_sold_out = serializers.BooleanField(read_only=True)

    class Meta:
        model = TicketTier
        fields = [
            "id", "name", "name_kn", "description", "tier_type",
            "price", "total_quantity", "sold_quantity",
            "available_quantity", "is_sold_out",
            "min_per_order", "max_per_order",
            "sale_start_datetime", "sale_end_datetime",
            "benefits", "is_active", "is_visible", "sort_order",
        ]
