import hmac
import hashlib
import json
from decimal import Decimal
from django.utils import timezone
from django.conf import settings as django_settings
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import Payment, Refund, PaymentWebhook, Gateway, PaymentStatus
from .serializers import (
    InitiatePaymentSerializer, VerifyPaymentSerializer,
    RefundSerializer, InitiateRefundSerializer, PaymentSerializer,
)
from apps.tickets.models import Order, Ticket, OrderItem, TicketTier


def _confirm_order(order: Order):
    from apps.tickets.models import Ticket
    import uuid as _uuid
    from apps.tickets.views import generate_ticket_number

    order.status = Order.Status.CONFIRMED
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_at"])

    for item in order.items.filter(status=OrderItem.Status.ACTIVE):
        tier = item.tier
        for _ in range(item.quantity):
            t = Ticket.objects.create(
                order=order,
                order_item=item,
                user=order.user,
                event=order.event,
                tier=tier,
                ticket_number=generate_ticket_number(order.event),
                holder_name=order.user.name,
                holder_email=order.user.email,
                holder_phone=order.user.phone or "",
                original_purchaser=order.user,
            )
            t.generate_qr_image()
            t.save(update_fields=["qr_image"])
        # Move reserved → sold
        tier.sold_quantity += item.quantity
        tier.reserved_quantity = max(0, tier.reserved_quantity - item.quantity)
        tier.save(update_fields=["sold_quantity", "reserved_quantity"])


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def initiate_payment(request):
    serializer = InitiatePaymentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    order = Order.objects.filter(
        pk=serializer.validated_data["order_id"], user=request.user
    ).first()
    if not order:
        return Response({"detail": "Order not found."}, status=404)
    if order.status not in [Order.Status.INITIATED, Order.Status.PAYMENT_PENDING]:
        return Response({"detail": f"Order is already {order.status}."}, status=400)

    gateway = serializer.validated_data["gateway"]

    # Handle free / comp
    if order.total_amount == Decimal("0") or gateway == "comp":
        payment = Payment.objects.create(
            order=order, gateway=Gateway.COMPLIMENTARY,
            amount=order.total_amount, status=PaymentStatus.SUCCESS,
            completed_at=timezone.now(),
        )
        _confirm_order(order)
        return Response({"payment_id": str(payment.id), "status": "success",
                         "gateway": "comp", "order_id": str(order.id)})

    if gateway == "cash":
        payment = Payment.objects.create(
            order=order, gateway=Gateway.CASH,
            amount=order.total_amount, status=PaymentStatus.PROCESSING,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        order.status = Order.Status.PAYMENT_PENDING
        order.payment_method = "cash"
        order.save(update_fields=["status", "payment_method"])
        return Response({"payment_id": str(payment.id), "status": "cash_pending",
                         "gateway": "cash"})

    # Razorpay
    try:
        import razorpay
        key_id = django_settings.RAZORPAY_KEY_ID
        key_secret = django_settings.RAZORPAY_KEY_SECRET
        if not key_secret or key_id in ("rzp_test_", ""):
            # Dev mode: simulate Razorpay order without hitting the API
            import uuid as _uuid
            rzp_order = {
                "id": f"order_DEV_{_uuid.uuid4().hex[:16]}",
                "entity": "order", "amount": int(order.total_amount * 100),
                "currency": order.currency, "status": "created",
            }
        else:
            client = razorpay.Client(auth=(key_id, key_secret))
            rzp_order = client.order.create({
                "amount": int(order.total_amount * 100),
                "currency": order.currency,
                "receipt": str(order.id)[:40],
                "notes": {"order_id": str(order.id), "user": order.user.email},
            })
        payment = Payment.objects.create(
            order=order,
            gateway=Gateway.RAZORPAY,
            gateway_order_id=rzp_order["id"],
            amount=order.total_amount,
            status=PaymentStatus.INITIATED,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        order.status = Order.Status.PAYMENT_PENDING
        order.payment_method = "razorpay"
        order.save(update_fields=["status", "payment_method"])
        return Response({
            "payment_id": str(payment.id),
            "gateway_order_id": rzp_order["id"],
            "razorpay_key": django_settings.RAZORPAY_KEY_ID,
            "amount": int(order.total_amount * 100),
            "currency": order.currency,
            "order_id": str(order.id),
        })
    except Exception as e:
        return Response({"detail": str(e)}, status=500)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def verify_payment(request):
    serializer = VerifyPaymentSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    order = Order.objects.filter(pk=d["order_id"], user=request.user).first()
    if not order:
        return Response({"detail": "Order not found."}, status=404)

    payment = Payment.objects.filter(
        order=order, gateway_order_id=d["gateway_order_id"]
    ).first()
    if not payment:
        return Response({"detail": "Payment record not found."}, status=404)

    # Verify HMAC signature (skip in dev mode when no real key is set)
    key_secret = django_settings.RAZORPAY_KEY_SECRET
    is_dev_mode = not key_secret or django_settings.RAZORPAY_KEY_ID in ("rzp_test_", "")
    if not is_dev_mode:
        body = f"{d['gateway_order_id']}|{d['gateway_payment_id']}"
        expected_sig = hmac.new(
            key_secret.encode(), body.encode(), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(expected_sig, d["gateway_signature"]):
            payment.status = PaymentStatus.FAILED
            payment.failure_reason = "Signature mismatch"
            payment.save(update_fields=["status", "failure_reason"])
            return Response({"detail": "Invalid payment signature."}, status=400)

    payment.gateway_payment_id = d["gateway_payment_id"]
    payment.gateway_signature = d["gateway_signature"]
    payment.status = PaymentStatus.SUCCESS
    payment.completed_at = timezone.now()
    payment.save(update_fields=["gateway_payment_id", "gateway_signature", "status", "completed_at"])

    _confirm_order(order)

    return Response({"status": "confirmed", "order_id": str(order.id)})


@api_view(["POST"])
@csrf_exempt
@permission_classes([permissions.AllowAny])
def razorpay_webhook(request):
    payload = request.body
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(
        django_settings.RAZORPAY_KEY_SECRET.encode(),
        payload, hashlib.sha256
    ).hexdigest()

    webhook = PaymentWebhook.objects.create(
        gateway="razorpay",
        event_type=request.data.get("event", ""),
        payload=request.data,
        signature=signature,
    )

    if not hmac.compare_digest(expected, signature):
        return Response({"detail": "Invalid signature."}, status=400)

    event_type = request.data.get("event", "")
    try:
        if event_type == "payment.captured":
            payment_data = request.data["payload"]["payment"]["entity"]
            payment = Payment.objects.filter(
                gateway_payment_id=payment_data["id"]
            ).first()
            if payment and payment.status != PaymentStatus.SUCCESS:
                payment.status = PaymentStatus.SUCCESS
                payment.completed_at = timezone.now()
                payment.save(update_fields=["status", "completed_at"])
                _confirm_order(payment.order)
        webhook.is_processed = True
        webhook.processed_at = timezone.now()
        webhook.save(update_fields=["is_processed", "processed_at"])
    except Exception as e:
        webhook.processing_error = str(e)
        webhook.save(update_fields=["processing_error"])

    return Response({"status": "ok"})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def initiate_refund(request):
    serializer = InitiateRefundSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    payment = Payment.objects.filter(
        pk=d["payment_id"], order__user=request.user
    ).first()
    if not payment:
        return Response({"detail": "Payment not found."}, status=404)
    if payment.status != PaymentStatus.SUCCESS:
        return Response({"detail": "Only successful payments can be refunded."}, status=400)

    ticket = None
    amount = payment.amount
    if d.get("ticket_id"):
        ticket = Ticket.objects.filter(pk=d["ticket_id"], user=request.user).first()
        if not ticket:
            return Response({"detail": "Ticket not found."}, status=404)
        amount = ticket.tier.price

    refund = Refund.objects.create(
        payment=payment,
        order=payment.order,
        ticket=ticket,
        amount=amount,
        reason=d["reason"],
        reason_detail=d.get("reason_detail", ""),
        initiated_by=request.user,
    )

    # In production, call Razorpay refund API here
    return Response(RefundSerializer(refund).data, status=201)
