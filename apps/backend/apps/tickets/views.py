from decimal import Decimal
from django.utils import timezone
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from datetime import timedelta

from .models import Order, OrderItem, Ticket, TicketTier, PromoCode, TicketTransfer
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

        total = subtotal - discount
        expires = timezone.now() + timedelta(minutes=15)

        order = Order.objects.create(
            user=request.user,
            event=event,
            promo_code=promo,
            status=Order.Status.INITIATED,
            subtotal=subtotal,
            discount_amount=discount,
            platform_fee=Decimal("0"),
            taxes=Decimal("0"),
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
    return Response(serializer.data)


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
