from decimal import Decimal
from django.conf import settings as django_settings
from django.utils import timezone
from django.db import models, transaction
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from datetime import timedelta

from .models import Order, OrderItem, Ticket, TicketTier, PromoCode, TicketTransfer
from .tax import compute_gst
from .serializers import (
    OrderSerializer, TicketSerializer, CreateOrderSerializer,
    PromoCodeValidateSerializer,
)
from apps.events.models import Event


def generate_ticket_number(event):
    count = Ticket.objects.filter(event=event).count() + 1
    prefix = event.title[:3].upper().replace(" ", "")
    return f"{prefix}-{count:05d}"


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_order(request):
    serializer = CreateOrderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    event = generics.get_object_or_404(Event, pk=data["event_id"], is_deleted=False)
    promo = None
    discount = Decimal("0")

    if data.get("promo_code"):
        promo = PromoCode.objects.filter(
            code__iexact=data["promo_code"], is_active=True,
            valid_from__lte=timezone.now(), valid_until__gte=timezone.now()
        ).filter(
            models.Q(event=event) | models.Q(event__isnull=True)
        ).first()

    with transaction.atomic():
        subtotal = Decimal("0")
        order_items_data = []

        for item_data in data["items"]:
            tier = generics.get_object_or_404(
                TicketTier, pk=item_data["tier_id"], event=event, is_active=True
            )
            qty = item_data["quantity"]
            if tier.available_quantity < qty:
                return Response(
                    {"detail": f"Only {tier.available_quantity} tickets left for {tier.name}."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            tier.reserved_quantity += qty
            tier.save(update_fields=["reserved_quantity"])
            line_total = tier.price * qty
            subtotal += line_total
            order_items_data.append({"tier": tier, "qty": qty, "price": tier.price, "total": line_total})

        if promo:
            if promo.discount_type == "pct":
                discount = (subtotal * promo.discount_value / 100).quantize(Decimal("0.01"))
            else:
                discount = min(promo.discount_value, subtotal)

        # Booking fee, charged per paid ticket. This used to be hardcoded to
        # zero here while the event page displayed a fee and a higher total —
        # so the price quoted was never the price charged. One source of truth
        # now, and free tickets stay genuinely free.
        paid_qty = sum(d["qty"] for d in order_items_data if d["price"] > 0)
        fee_per_ticket = Decimal(str(getattr(django_settings, "CONVENIENCE_FEE", 0)))
        platform_fee = fee_per_ticket * paid_qty if subtotal > 0 else Decimal("0")

        # GST is zero until a rate is configured — see apps/tickets/tax.py.
        gst = compute_gst(
            ticket_subtotal=subtotal - discount,
            booking_fee=platform_fee,
            ticket_count=sum(d["qty"] for d in order_items_data),
        )

        total = subtotal - discount + platform_fee + gst["total"]
        expires = timezone.now() + timedelta(minutes=15)

        order = Order.objects.create(
            user=request.user,
            event=event,
            promo_code=promo,
            status=Order.Status.INITIATED,
            subtotal=subtotal,
            discount_amount=discount,
            platform_fee=platform_fee,
            taxes=gst["total"],
            total_amount=total,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
            expires_at=expires,
        )

        for d in order_items_data:
            OrderItem.objects.create(
                order=order, tier=d["tier"], quantity=d["qty"],
                unit_price=d["price"], total_price=d["total"]
            )

    return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_orders(request):
    orders = Order.objects.filter(user=request.user).prefetch_related("items__tier").select_related("event")
    serializer = OrderSerializer(orders, many=True)
    return Response(serializer.data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def my_tickets(request):
    tickets = Ticket.objects.filter(
        user=request.user
    ).select_related("event", "event__venue", "tier").order_by("-created_at")
    serializer = TicketSerializer(tickets, many=True, context={"request": request})
    data = serializer.data
    return Response({"count": len(data), "results": data})


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def ticket_detail(request, pk):
    ticket = generics.get_object_or_404(Ticket, pk=pk, user=request.user)
    if not ticket.qr_image:
        ticket.generate_qr_image()
        ticket.save(update_fields=["qr_image"])
    serializer = TicketSerializer(ticket, context={"request": request})
    return Response(serializer.data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def scan_ticket(request, qr_data):
    from django.utils import timezone
    ticket = generics.get_object_or_404(Ticket, qr_data=qr_data)
    if ticket.status != Ticket.Status.VALID:
        return Response(
            {"valid": False, "detail": f"Ticket is {ticket.get_status_display()}."},
            status=status.HTTP_400_BAD_REQUEST
        )
    ticket.status = Ticket.Status.USED
    ticket.checked_in_at = timezone.now()
    ticket.checked_in_by = request.user
    ticket.save(update_fields=["status", "checked_in_at", "checked_in_by"])
    serializer = TicketSerializer(ticket, context={"request": request})
    return Response({"valid": True, "ticket": serializer.data})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def validate_promo(request):
    from apps.events.models import Event as EventModel
    serializer = PromoCodeValidateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data
    promo = PromoCode.objects.filter(
        code__iexact=d["code"], is_active=True,
        valid_from__lte=timezone.now(), valid_until__gte=timezone.now()
    ).filter(
        models.Q(event_id=d["event_id"]) | models.Q(event__isnull=True)
    ).first()

    if not promo:
        return Response({"valid": False, "detail": "Invalid or expired promo code."})

    if promo.max_uses and promo.used_count >= promo.max_uses:
        return Response({"valid": False, "detail": "Promo code limit reached."})

    amount = d["order_amount"]
    if amount < promo.min_order_amount:
        return Response({"valid": False,
                         "detail": f"Minimum order amount ₹{promo.min_order_amount} required."})

    if promo.discount_type == "pct":
        discount = (amount * promo.discount_value / 100).quantize(Decimal("0.01"))
    else:
        discount = min(promo.discount_value, amount)

    return Response({
        "valid": True,
        "discount_type": promo.discount_type,
        "discount_value": float(promo.discount_value),
        "discount_amount": float(discount),
        "new_total": float(amount - discount),
    })


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def order_invoice(request, pk):
    """A tax invoice for one confirmed order.

    Charging GST obliges you to issue one of these, so it is generated from the
    order rather than reconstructed later. Returns JSON the frontend renders and
    the buyer can print; it deliberately re-derives the split from the stored
    total rather than recomputing rates, so an invoice always matches what was
    actually charged even if a rate changes afterwards.
    """
    from decimal import Decimal, ROUND_HALF_UP

    order = generics.get_object_or_404(Order, pk=pk, user=request.user)
    if order.status != Order.Status.CONFIRMED:
        return Response(
            {"detail": "An invoice is available once the order is confirmed."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    taxes = order.taxes or Decimal("0")
    half = (taxes / 2).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    return Response({
        "invoice_number": f"NAADA-{str(order.id)[:8].upper()}",
        "issued_at": (order.confirmed_at or order.created_at).isoformat(),
        "seller": {
            "name": getattr(django_settings, "INVOICE_SELLER_NAME", "Naada"),
            "address": getattr(django_settings, "INVOICE_SELLER_ADDRESS", ""),
            "gstin": getattr(django_settings, "GSTIN", ""),
        },
        "buyer": {
            "name": order.user.name,
            "email": order.user.email,
        },
        "event": {
            "title": order.event.title,
            "starts_at": order.event.start_datetime.isoformat(),
            "venue": getattr(order.event.venue, "name", ""),
        },
        "lines": [
            {
                "description": f"{i.tier.name if i.tier else 'General'} admission",
                "quantity": i.quantity,
                "unit_price": str(i.unit_price),
                "amount": str(i.total_price),
            }
            for i in order.items.select_related("tier")
        ],
        "subtotal": str(order.subtotal),
        "discount": str(order.discount_amount),
        "booking_fee": str(order.platform_fee),
        "cgst": str(half),
        "sgst": str(taxes - half),
        "taxes_total": str(taxes),
        "total": str(order.total_amount),
        "currency": order.currency,
        # True only once a rate is configured; until then this is a receipt.
        "is_tax_invoice": taxes > 0,
    })
