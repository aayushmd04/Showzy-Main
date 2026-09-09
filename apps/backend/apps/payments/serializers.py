from rest_framework import serializers
from .models import Payment, Refund


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            "id", "order", "gateway", "gateway_payment_id",
            "gateway_order_id", "amount", "currency", "status",
            "failure_reason", "initiated_at", "completed_at",
        ]
        read_only_fields = ["id", "initiated_at", "completed_at"]


class InitiatePaymentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    gateway = serializers.ChoiceField(choices=["razorpay", "upi", "cash", "comp"])


class VerifyPaymentSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    gateway_payment_id = serializers.CharField()
    gateway_order_id = serializers.CharField()
    gateway_signature = serializers.CharField()


class RefundSerializer(serializers.ModelSerializer):
    initiated_by_name = serializers.CharField(source="initiated_by.name", read_only=True)

    class Meta:
        model = Refund
        fields = [
            "id", "order", "ticket", "amount", "reason",
            "reason_detail", "status", "gateway_refund_id",
            "initiated_by_name", "initiated_at", "processed_at",
        ]
        read_only_fields = ["id", "status", "gateway_refund_id", "processed_at"]


class InitiateRefundSerializer(serializers.Serializer):
    payment_id = serializers.UUIDField()
    ticket_id = serializers.UUIDField(required=False)
    reason = serializers.ChoiceField(choices=Refund.Reason.choices)
    reason_detail = serializers.CharField(required=False, allow_blank=True)
