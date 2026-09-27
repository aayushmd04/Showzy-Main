import hashlib
import json
import logging
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.urls import NoReverseMatch, reverse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .gateways import (
    OUTCOMES,
    OUTCOME_FAILED,
    OUTCOME_PENDING,
    OUTCOME_SUCCESS,
    GatewayConfigurationError,
    GatewayError,
    get_gateway,
    to_paise,
)
from .models import Payment, Refund, PaymentWebhook, Gateway, PaymentStatus
from .serializers import (
    InitiatePaymentSerializer, VerifyPaymentSerializer,
    RefundSerializer, InitiateRefundSerializer, PaymentSerializer,
)
from apps.tickets.models import Order, Ticket, OrderItem, TicketTier

logger = logging.getLogger(__name__)

#: gateways that legitimately move money outside the online gateway
OFFLINE_GATEWAYS = {Gateway.CASH, Gateway.COMPLIMENTARY}


def _confirm_order(order: Order):
    from apps.tickets.models import Ticket
    import uuid as _uuid
    from apps.tickets.views import generate_ticket_number

    order.status = Order.Status.CONFIRMED
    order.confirmed_at = timezone.now()
    order.save(update_fields=["status", "confirmed_at"])

    # A per-seat booking snapshot, if the buyer picked specific seats — a list
    # of {"id","label","furniture"} in the order they were claimed. Consumed
    # one at a time as tickets are issued below, across every tier in the
    # order, so the pointer lives outside the per-item loop.
    allocation = getattr(order, "zone_allocation", None)
    seat_queue = list(allocation.seat_ids) if allocation and allocation.seat_ids else []
    seat_index = 0

    for item in order.items.filter(status=OrderItem.Status.ACTIVE):
        tier = item.tier
        for _ in range(item.quantity):
            seat_label = ""
            if seat_index < len(seat_queue):
                seat = seat_queue[seat_index]
                seat_label = f"{allocation.zone_label} · {seat['label']}"
                seat_index += 1
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
                **({"seat_label": seat_label} if seat_label else {}),
            )
            t.generate_qr_image()
            t.save(update_fields=["qr_image"])
        # Move reserved → sold
        tier.sold_quantity += item.quantity
        tier.reserved_quantity = max(0, tier.reserved_quantity - item.quantity)
        tier.save(update_fields=["sold_quantity", "reserved_quantity"])


def _confirm_order_once(order: Order) -> bool:
    """Idempotent wrapper around `_confirm_order`.

    Gateways retry webhooks and users double-click "verify".  Confirming twice
    would issue a second set of tickets and double-count tier inventory, so the
    row is locked and re-read before we decide.  Returns True if this call did
    the confirming.
    """
    with transaction.atomic():
        locked = Order.objects.select_for_update().get(pk=order.pk)
        if locked.status == Order.Status.CONFIRMED or locked.tickets.exists():
            logger.info("Order %s already confirmed; skipping duplicate confirm.", order.pk)
            return False
        _confirm_order(locked)
    order.refresh_from_db()

    # Only ever fires on the call that did the confirming, so a retried webhook
    # cannot email the buyer twice. Best-effort by design: the ticket is already
    # issued and a failed receipt must not undo that.
    try:
        from apps.notifications.dispatch import order_confirmed

        order_confirmed(order)
    except Exception:
        logger.exception("Confirmation notification failed for order %s", order.pk)

    return True


def _resolve_gateway():
    """Return (gateway, error_response). Never silently downgrades to mock."""
    try:
        return get_gateway(), None
    except GatewayConfigurationError as exc:
        logger.error("Payment gateway misconfigured: %s", exc)
        return None, Response(
            {"detail": "Payment gateway is not configured.", "error": str(exc)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )


def _mock_checkout_url():
    try:
        return reverse("payments-mock-checkout")
    except NoReverseMatch:  # pragma: no cover - url is always registered
        return None


def _initiate_response(*, order, payment, gateway_name, is_mock, public_key,
                       gateway_order_id, amount_paise, state, mock_checkout_url=None):
    """The single response contract consumed by the checkout UI.

    Every payment path returns these keys, so the frontend branches on
    `is_mock` (simulated checkout) vs not (load Razorpay's SDK) and on nothing
    else.
    """
    return {
        "payment_id": str(payment.id),
        "order_id": str(order.id),
        "gateway": gateway_name,
        "is_mock": is_mock,
        "key": public_key,
        # kept so any existing frontend code continues to work unchanged
        "razorpay_key": public_key,
        "gateway_order_id": gateway_order_id,
        "amount": amount_paise,
        "currency": order.currency,
        "status": state,
        "mock_checkout_url": mock_checkout_url,
    }


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

    requested = serializer.validated_data["gateway"]

    # ── Free / complimentary: no gateway involved, legitimately ──────────────
    # An order that is already ₹0 (a free event) is fine for any buyer to
    # confirm this way. But "comp" on a PAID order zeroes it out with no money
    # moving — that must stay a privilege of the event's organiser/staff, or
    # any signed-in buyer could self-select it on their own paid order and get
    # a free ticket.
    is_already_free = order.total_amount == Decimal("0")
    if requested == "comp" and not is_already_free:
        is_privileged = request.user.is_staff or order.event.organizer_id == request.user.id
        if not is_privileged:
            return Response(
                {"detail": "Only the event organiser can issue a complimentary ticket for a paid order."},
                status=status.HTTP_403_FORBIDDEN,
            )

    if is_already_free or requested == "comp":
        payment = Payment.objects.create(
            order=order, gateway=Gateway.COMPLIMENTARY,
            amount=order.total_amount, currency=order.currency,
            status=PaymentStatus.SUCCESS,
            completed_at=timezone.now(),
        )
        _confirm_order_once(order)
        return Response(_initiate_response(
            order=order, payment=payment, gateway_name="comp", is_mock=False,
            public_key="", gateway_order_id="", amount_paise=0, state="success",
        ))

    # ── Cash at the door: collected offline ──────────────────────────────────
    if requested == "cash":
        payment = Payment.objects.create(
            order=order, gateway=Gateway.CASH,
            amount=order.total_amount, currency=order.currency,
            status=PaymentStatus.PROCESSING,
            ip_address=request.META.get("REMOTE_ADDR"),
        )
        order.status = Order.Status.PAYMENT_PENDING
        order.payment_method = "cash"
        order.save(update_fields=["status", "payment_method"])
        return Response(_initiate_response(
            order=order, payment=payment, gateway_name="cash", is_mock=False,
            public_key="", gateway_order_id="",
            amount_paise=to_paise(order.total_amount), state="cash_pending",
        ))

    # ── Online gateway (Razorpay or its mock) ────────────────────────────────
    gateway, error = _resolve_gateway()
    if error:
        return error

    try:
        gw_order = gateway.create_order(order)
    except GatewayError as exc:
        logger.exception("Gateway order creation failed for order %s", order.id)
        return Response({"detail": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    payment = Payment.objects.create(
        order=order,
        gateway=Gateway.RAZORPAY,
        gateway_order_id=gw_order["id"],
        amount=order.total_amount,
        currency=order.currency,
        status=PaymentStatus.INITIATED,
        gateway_response=gw_order,
        metadata={"gateway_impl": gateway.name, "is_mock": gateway.is_mock},
        ip_address=request.META.get("REMOTE_ADDR"),
    )
    order.status = Order.Status.PAYMENT_PENDING
    order.payment_method = "razorpay"
    order.save(update_fields=["status", "payment_method"])

    return Response(_initiate_response(
        order=order, payment=payment, gateway_name=gateway.name,
        is_mock=gateway.is_mock, public_key=gateway.public_key,
        gateway_order_id=gw_order["id"], amount_paise=gw_order["amount"],
        state="created",
        mock_checkout_url=_mock_checkout_url() if gateway.is_mock else None,
    ))


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def mock_checkout(request):
    """Stand-in for Razorpay's hosted checkout — mock gateway only.

    The browser cannot sign anything (the secret is server-side), so the demo
    UI calls this to obtain a payment id + signature, then POSTs them to
    /payments/verify/ exactly as the real Razorpay handler would.  The
    signature produced here is a real HMAC and is really verified.

    Body: {order_id, gateway_order_id, outcome?}
    `outcome` (success|failed|pending) overrides the amount-derived outcome.
    """
    gateway, error = _resolve_gateway()
    if error:
        return error
    if not gateway.is_mock:
        return Response({"detail": "Mock checkout is disabled; a live gateway is active."},
                        status=404)

    order_id = request.data.get("order_id")
    gateway_order_id = request.data.get("gateway_order_id")
    if not order_id or not gateway_order_id:
        return Response({"detail": "order_id and gateway_order_id are required."}, status=400)

    payment = Payment.objects.filter(
        order__id=order_id, order__user=request.user, gateway_order_id=gateway_order_id
    ).first()
    if not payment:
        return Response({"detail": "Payment record not found."}, status=404)

    outcome = request.data.get("outcome")
    if outcome:
        if outcome not in OUTCOMES:
            return Response({"detail": f"outcome must be one of {list(OUTCOMES)}."}, status=400)
    else:
        outcome = gateway.outcome_for_amount(payment.amount)

    if outcome == OUTCOME_FAILED:
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = "Simulated payment failure (mock gateway)"
        payment.save(update_fields=["status", "failure_reason"])
        return Response({
            "status": OUTCOME_FAILED,
            "error": {
                "code": "BAD_REQUEST_ERROR",
                "description": "Payment failed",
                "source": "customer",
                "step": "payment_authentication",
                "reason": "payment_failed",
                "metadata": {"order_id": gateway_order_id},
            },
        })

    if outcome == OUTCOME_PENDING:
        payment.status = PaymentStatus.PROCESSING
        payment.save(update_fields=["status"])
        return Response({"status": OUTCOME_PENDING, "gateway_order_id": gateway_order_id})

    payment_id = gateway.new_payment_id()
    signature = gateway.sign_checkout(gateway_order_id, payment_id)
    return Response({
        "status": OUTCOME_SUCCESS,
        "gateway_order_id": gateway_order_id,
        "gateway_payment_id": payment_id,
        "gateway_signature": signature,
        # Razorpay's own field names, so a mock checkout handler is a drop-in
        "razorpay_order_id": gateway_order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": signature,
    })


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

    # Already verified (double-submit, or a webhook beat the browser here).
    if payment.status == PaymentStatus.SUCCESS:
        _confirm_order_once(order)
        return Response({"status": "confirmed", "order_id": str(order.id),
                         "already_verified": True})

    gateway, error = _resolve_gateway()
    if error:
        return error

    # Signature verification always runs — mock and live alike.
    valid = gateway.verify_signature({
        "order_id": d["gateway_order_id"],
        "payment_id": d["gateway_payment_id"],
        "signature": d["gateway_signature"],
    })
    if not valid:
        payment.status = PaymentStatus.FAILED
        payment.failure_reason = "Signature mismatch"
        payment.save(update_fields=["status", "failure_reason"])
        return Response({"detail": "Invalid payment signature."}, status=400)

    payment.gateway_payment_id = d["gateway_payment_id"]
    payment.gateway_signature = d["gateway_signature"]
    payment.status = PaymentStatus.SUCCESS
    payment.completed_at = timezone.now()
    payment.save(update_fields=["gateway_payment_id", "gateway_signature",
                                "status", "completed_at"])

    _confirm_order_once(order)

    return Response({"status": "confirmed", "order_id": str(order.id)})


def _webhook_event_id(request, raw_body: bytes, payload: dict) -> str:
    """Stable id for a webhook delivery, for idempotency.

    Razorpay sends `X-Razorpay-Event-Id` and repeats it on every retry of the
    same event.  If it is absent we fall back to a hash of the body, which is
    equally stable for a repeated delivery.
    """
    header_id = request.headers.get("X-Razorpay-Event-Id", "").strip()
    if header_id:
        return header_id[:120]
    return "sha256:" + hashlib.sha256(raw_body or b"").hexdigest()[:100]


@api_view(["POST"])
@csrf_exempt
@permission_classes([permissions.AllowAny])
def razorpay_webhook(request):
    raw_body = request.body
    signature = request.headers.get("X-Razorpay-Signature", "")

    gateway, error = _resolve_gateway()
    if error:
        return error

    # 1. Verify BEFORE touching the database — unsigned traffic leaves no trace.
    if not gateway.verify_webhook_signature(raw_body, signature):
        logger.warning("Rejected webhook with invalid signature (%d bytes).", len(raw_body or b""))
        return Response({"detail": "Invalid signature."}, status=400)

    try:
        payload = json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except (ValueError, UnicodeDecodeError):
        return Response({"detail": "Malformed webhook body."}, status=400)
    if not isinstance(payload, dict):
        return Response({"detail": "Malformed webhook body."}, status=400)

    event_type = payload.get("event", "")
    event_id = _webhook_event_id(request, raw_body, payload)

    # 2. Idempotency: the same delivery must never be processed twice.
    try:
        with transaction.atomic():
            webhook, created = PaymentWebhook.objects.get_or_create(
                gateway="razorpay",
                event_id=event_id,
                defaults={"event_type": event_type, "payload": payload,
                          "signature": signature},
            )
    except IntegrityError:  # raced with a concurrent delivery of the same event
        created = False
        webhook = PaymentWebhook.objects.filter(
            gateway="razorpay", event_id=event_id).first()

    if not created:
        logger.info("Duplicate webhook %s (%s) ignored.", event_id, event_type)
        return Response({"status": "ok", "duplicate": True})

    # 3. Process.
    try:
        if event_type == "payment.captured":
            entity = payload["payload"]["payment"]["entity"]
            payment = Payment.objects.filter(gateway_payment_id=entity["id"]).first()
            if payment is None:
                # Browser never returned; match on the gateway order id instead.
                payment = Payment.objects.filter(
                    gateway_order_id=entity.get("order_id", "")).first()
                if payment is not None:
                    payment.gateway_payment_id = entity["id"]
                    payment.save(update_fields=["gateway_payment_id"])
            if payment and payment.status != PaymentStatus.SUCCESS:
                payment.status = PaymentStatus.SUCCESS
                payment.completed_at = timezone.now()
                payment.save(update_fields=["status", "completed_at"])
            if payment:
                _confirm_order_once(payment.order)

        elif event_type == "payment.failed":
            entity = payload["payload"]["payment"]["entity"]
            payment = (Payment.objects.filter(gateway_payment_id=entity["id"]).first()
                       or Payment.objects.filter(
                           gateway_order_id=entity.get("order_id", "")).first())
            if payment and payment.status != PaymentStatus.SUCCESS:
                payment.status = PaymentStatus.FAILED
                payment.failure_reason = entity.get("error_description") or "Payment failed"
                payment.save(update_fields=["status", "failure_reason"])

        elif event_type in ("refund.processed", "refund.created"):
            entity = payload["payload"]["refund"]["entity"]
            refund = Refund.objects.filter(gateway_refund_id=entity["id"]).first()
            if refund and refund.status != Refund.Status.SUCCESS:
                refund.status = Refund.Status.SUCCESS
                refund.processed_at = timezone.now()
                refund.gateway_response = entity
                refund.save(update_fields=["status", "processed_at", "gateway_response"])

        webhook.is_processed = True
        webhook.processed_at = timezone.now()
        webhook.save(update_fields=["is_processed", "processed_at"])
    except Exception as e:
        logger.exception("Webhook %s (%s) processing failed", event_id, event_type)
        webhook.processing_error = str(e)
        webhook.save(update_fields=["processing_error"])

    return Response({"status": "ok"})


def _create_and_process_refund(*, payment, ticket, amount, reason, reason_detail, initiated_by):
    """Create a Refund row and push it through the gateway (or settle it
    offline). Shared by the buyer-facing `initiate_refund` endpoint and
    ticket cancellation, so there is exactly one place that ever moves money
    back to a buyer.

    Returns `(refund, error_response)` — exactly one of the two is not None.
    A non-None `error_response` is a DRF `Response` the caller should return
    as-is; the refund row still exists (as FAILED) for the audit trail.
    """
    already_refunded = sum(
        (r.amount for r in payment.refunds.filter(
            status__in=[Refund.Status.SUCCESS, Refund.Status.PROCESSING])),
        Decimal("0"),
    )
    if already_refunded + amount > payment.amount:
        return None, Response(
            {"detail": "Refund amount exceeds the remaining refundable balance."},
            status=400,
        )

    refund = Refund.objects.create(
        payment=payment,
        order=payment.order,
        ticket=ticket,
        amount=amount,
        reason=reason,
        reason_detail=reason_detail,
        initiated_by=initiated_by,
        status=Refund.Status.PROCESSING,
    )

    # Cash / complimentary money never went through a gateway; settling it is
    # an offline act, recorded here for the audit trail.
    if payment.gateway in OFFLINE_GATEWAYS or payment.amount == Decimal("0") or amount == Decimal("0"):
        refund.status = Refund.Status.SUCCESS
        refund.processed_at = timezone.now()
        refund.gateway_response = {"offline": True, "gateway": payment.gateway}
        refund.save(update_fields=["status", "processed_at", "gateway_response"])
        _apply_refund_to_payment(payment)
        return refund, None

    gateway, error = _resolve_gateway()
    if error:
        refund.status = Refund.Status.FAILED
        refund.failure_reason = "Payment gateway is not configured."
        refund.save(update_fields=["status", "failure_reason"])
        return refund, error

    try:
        gw_refund = gateway.refund(
            payment, amount,
            notes={"order_id": str(payment.order_id), "reason": reason,
                   "refund_id": str(refund.id)},
        )
    except GatewayError as exc:
        # No money moved: leave a FAILED row rather than a PENDING one that
        # looks like an in-flight refund forever.
        logger.exception("Refund failed at gateway for payment %s", payment.pk)
        refund.status = Refund.Status.FAILED
        refund.failure_reason = str(exc)
        refund.save(update_fields=["status", "failure_reason"])
        return refund, Response(
            {"detail": "Refund could not be processed by the payment gateway.",
             "error": str(exc), "refund": RefundSerializer(refund).data},
            status=status.HTTP_502_BAD_GATEWAY,
        )

    refund.gateway_refund_id = gw_refund.get("id", "")
    refund.gateway_response = gw_refund
    # Razorpay: "processed" = money returned, "pending" = still in flight.
    refund.status = (Refund.Status.SUCCESS if gw_refund.get("status") == "processed"
                     else Refund.Status.PROCESSING)
    if refund.status == Refund.Status.SUCCESS:
        refund.processed_at = timezone.now()
    refund.save(update_fields=["gateway_refund_id", "gateway_response",
                               "status", "processed_at"])

    if refund.status == Refund.Status.SUCCESS:
        _apply_refund_to_payment(payment)

    return refund, None


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
    if payment.status not in (PaymentStatus.SUCCESS, PaymentStatus.PARTIALLY_REFUNDED):
        return Response({"detail": "Only successful payments can be refunded."}, status=400)

    ticket = None
    amount = payment.amount
    if d.get("ticket_id"):
        ticket = Ticket.objects.filter(pk=d["ticket_id"], user=request.user).first()
        if not ticket:
            return Response({"detail": "Ticket not found."}, status=404)
        amount = ticket.tier.price

    refund, error = _create_and_process_refund(
        payment=payment, ticket=ticket, amount=amount,
        reason=d["reason"], reason_detail=d.get("reason_detail", ""),
        initiated_by=request.user,
    )
    if error:
        return error
    return Response(RefundSerializer(refund).data, status=201)


def _apply_refund_to_payment(payment: Payment):
    """Reflect settled refunds on the payment row (full vs partial)."""
    settled = sum((r.amount for r in payment.refunds.filter(status=Refund.Status.SUCCESS)),
                  Decimal("0"))
    if settled <= 0:
        return
    payment.status = (PaymentStatus.REFUNDED if settled >= payment.amount
                      else PaymentStatus.PARTIALLY_REFUNDED)
    payment.save(update_fields=["status"])
