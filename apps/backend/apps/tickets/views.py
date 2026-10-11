from decimal import Decimal
from django.conf import settings as django_settings
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import models, transaction
from rest_framework import exceptions, generics, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from datetime import timedelta

from .models import (
    Order, OrderItem, Ticket, TicketTier, PromoCode, TicketTransfer, ZoneAllocation,
)
from .tax import compute_gst
from . import zones as zone_map
from .serializers import (
    OrderSerializer, TicketSerializer, CreateOrderSerializer,
    PromoCodeValidateSerializer, ZoneSerializer, TransferTicketSerializer,
    AttendeeSerializer,
)
from apps.events.models import Event, EventStatus

User = get_user_model()


class ZoneUnavailable(exceptions.APIException):
    """A 400 that also unwinds the transaction.

    The tier reservations for this order have already been written by the time
    the zone is checked, so returning a plain response here would leave seats
    held by an order that was never created. Raising rolls the whole attempt
    back, and DRF still renders `{"detail": ...}` for the buyer.
    """

    status_code = status.HTTP_400_BAD_REQUEST


def generate_ticket_number(event):
    count = Ticket.objects.filter(event=event).count() + 1
    prefix = event.title[:3].upper().replace(" ", "")
    return f"{prefix}-{count:05d}"


@api_view(["GET"])
@permission_classes([permissions.AllowAny])
def event_zones(request, event_id):
    """The venue floor plan for one event, with live availability per zone.

    Public, because a buyer needs to see where they would be sitting before
    they have any reason to sign in. `has_layout: false` is a perfectly normal
    answer — most open mics are standing room — and the checkout flow treats it
    as "no zone step", not as an error.
    """
    event = generics.get_object_or_404(
        Event.objects.select_related("venue"), pk=event_id, is_deleted=False
    )
    zones = zone_map.zone_availability(event)
    bookable = [z for z in zones if z["bookable"]]

    return Response({
        "event_id": str(event.id),
        "venue_name": getattr(event.venue, "name", "") or "",
        "has_layout": bool(zones),
        "bookable_count": len(bookable),
        "places_available": sum(z["available"] for z in bookable),
        "zones": ZoneSerializer(zones, many=True).data,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def create_order(request):
    serializer = CreateOrderSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    event = generics.get_object_or_404(Event, pk=data["event_id"], is_deleted=False)

    # A cancelled or already-finished event has nothing left to sell — checked
    # here, not just left to the UI, since this is the one place an order
    # actually gets created.
    if event.status == EventStatus.CANCELLED:
        return Response(
            {"detail": "This event has been cancelled."},
            status=status.HTTP_400_BAD_REQUEST
        )
    if event.end_datetime <= timezone.now():
        return Response(
            {"detail": "This event has already happened — tickets are no longer on sale."},
            status=status.HTTP_400_BAD_REQUEST
        )

    promo = None
    discount = Decimal("0")

    if data.get("promo_code"):
        promo = PromoCode.objects.filter(
            code__iexact=data["promo_code"], is_active=True,
            valid_from__lte=timezone.now(), valid_until__gte=timezone.now()
        ).filter(
            models.Q(event=event) | models.Q(event__isnull=True)
        ).first()

    requested_zone_id = (data.get("zone_id") or "").strip()

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

        ticket_count = sum(d["qty"] for d in order_items_data)

        # ── Floor-plan zone ───────────────────────────────────────────────
        # Optional throughout. Only a venue with a layout can offer one, and a
        # buyer who does not care never sends one.
        zone = None
        matched_seats = []
        baby_chairs = 0
        if requested_zone_id:
            # Lock this zone's existing claims for the length of the
            # transaction so two buyers racing for the last table cannot both
            # read "one place left". (A no-op on SQLite, which serialises
            # writes anyway; it matters on Postgres in production.)
            list(
                ZoneAllocation.objects.select_for_update().filter(
                    event=event, zone_id=requested_zone_id
                )
            )
            zone = zone_map.find_zone(event, requested_zone_id)
            if zone is None:
                raise ZoneUnavailable(
                    "That area is no longer part of this venue's layout. Pick another one."
                )
            if not zone["bookable"]:
                raise ZoneUnavailable(f"{zone['label']} isn't a bookable area.")
            if zone["available"] < ticket_count:
                raise ZoneUnavailable(
                    f"{zone['label']} is fully booked."
                    if zone["available"] == 0
                    else f"Only {zone['available']} place"
                         f"{'' if zone['available'] == 1 else 's'} left in {zone['label']}."
                )

            # Seat-level booking: this zone has named seats, so a quantity
            # alone is not enough — the buyer must say which ones.
            if zone.get("seats"):
                requested_seat_ids = data.get("seat_ids") or []
                if not requested_seat_ids:
                    raise ZoneUnavailable("Pick a seat for each ticket.")
                if len(requested_seat_ids) != ticket_count:
                    raise ZoneUnavailable(
                        f"You picked {len(requested_seat_ids)} seats for {ticket_count} tickets."
                    )
                matched_seats = zone_map.find_seats(zone, requested_seat_ids)
                if matched_seats is None:
                    raise ZoneUnavailable(
                        "One of those seats has just been taken — pick again."
                    )
            # A zone with no seats ignores any seat_ids the buyer sent —
            # whole-zone booking, exactly as before.

            # Optional baby-chair add-on, checked against what is left now.
            baby_chairs = data.get("baby_chairs") or 0
            if baby_chairs > zone.get("baby_chairs_available", 0):
                raise ZoneUnavailable(
                    f"{zone['label']} has no baby chairs left."
                    if zone.get("baby_chairs_available", 0) == 0
                    else f"Only {zone['baby_chairs_available']} baby chair"
                         f"{'' if zone['baby_chairs_available'] == 1 else 's'} left at {zone['label']}."
                )

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
            ticket_count=ticket_count,
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

        if zone is not None:
            ZoneAllocation.objects.create(
                order=order,
                event=event,
                zone_id=zone["id"],
                zone_label=zone["label"],
                zone_type=zone["type"],
                quantity=ticket_count,
                capacity_at_booking=zone["capacity"],
                seat_ids=matched_seats,
                baby_chairs=baby_chairs,
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


#: Cancelling this close to the event forfeits the ticket price — the buyer
#: sees this exact policy stated on the confirmation dialog before they tap
#: through, so it must actually hold rather than just being copy.
FREE_CANCEL_CUTOFF_HOURS = 24


def _release_ticket_allocation(ticket: Ticket):
    """Hand back whatever floor-plan place this one ticket was holding.

    `ZoneAllocation` is one row per *order*, not per ticket, so cancelling one
    ticket out of a multi-ticket order must shrink the allocation rather than
    releasing the whole thing — the other tickets in the order are still
    valid and still need their places. A seat-level booking frees exactly the
    seat this ticket names (matched by the same `"{zone_label} · {seat
    label}"` string `_confirm_order` stamped onto it); a whole-zone booking
    just frees one place from the shared headcount.
    """
    allocation = getattr(ticket.order, "zone_allocation", None)
    if not allocation or allocation.status != ZoneAllocation.Status.HELD:
        return

    if allocation.seat_ids:
        remaining = []
        freed = False
        for seat in allocation.seat_ids:
            label = f"{allocation.zone_label} · {seat.get('label', '')}"
            if not freed and ticket.seat_label and label == ticket.seat_label:
                freed = True
                continue
            remaining.append(seat)
        allocation.seat_ids = remaining
        if freed:
            allocation.quantity = max(0, allocation.quantity - 1)
    else:
        allocation.quantity = max(0, allocation.quantity - 1)

    if allocation.quantity <= 0:
        allocation.release()
    else:
        allocation.save(update_fields=["seat_ids", "quantity", "updated_at"])


def _sync_order_cancellation_status(order: Order):
    """Reflect a ticket cancellation on the order it belongs to.

    Only ever moves an order that is still live (confirmed, or already
    partially cancelled) — an order that expired or was fully refunded some
    other way is left exactly as it is.
    """
    if order.status not in (Order.Status.CONFIRMED, Order.Status.PARTIALLY_CANCELLED):
        return
    if order.tickets.filter(status=Ticket.Status.VALID).exists():
        if order.status != Order.Status.PARTIALLY_CANCELLED:
            order.status = Order.Status.PARTIALLY_CANCELLED
            order.save(update_fields=["status"])
    else:
        order.status = Order.Status.FULLY_CANCELLED
        order.cancelled_at = timezone.now()
        order.save(update_fields=["status", "cancelled_at"])


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def cancel_ticket(request, pk):
    """A buyer cancels their own ticket.

    Refunds the ticket's admission price (the tier price at purchase time) —
    the booking fee and any tax on it are not refundable, the same convention
    `initiate_refund` already used for a single-ticket refund. Cancelling
    within `FREE_CANCEL_CUTOFF_HOURS` of the event forfeits that price
    entirely: the ticket is still cancelled and the place still freed, but no
    money moves. Free tickets skip the refund machinery altogether — there is
    nothing to give back.
    """
    from apps.payments.models import Payment, PaymentStatus, Refund
    from apps.payments.views import _create_and_process_refund

    ticket = generics.get_object_or_404(
        Ticket.objects.select_related("order", "tier", "event"), pk=pk, user=request.user
    )
    reason_detail = (request.data.get("reason") or "").strip()[:200]

    with transaction.atomic():
        locked = Ticket.objects.select_for_update().select_related(
            "order", "tier", "event"
        ).get(pk=ticket.pk)
        if locked.status != Ticket.Status.VALID:
            return Response(
                {"detail": f"This ticket is {locked.get_status_display().lower()} and can't be cancelled."},
                status=400,
            )

        refund = None
        if locked.tier.price > 0:
            hours_left = (locked.event.start_datetime - timezone.now()).total_seconds() / 3600
            refund_amount = Decimal("0") if hours_left < FREE_CANCEL_CUTOFF_HOURS else locked.tier.price

            payment = Payment.objects.filter(
                order=locked.order, status__in=[PaymentStatus.SUCCESS, PaymentStatus.PARTIALLY_REFUNDED]
            ).order_by("-completed_at").first()
            if not payment:
                return Response(
                    {"detail": "No successful payment found for this ticket — contact support."},
                    status=400,
                )
            refund, error = _create_and_process_refund(
                payment=payment, ticket=locked, amount=refund_amount,
                reason=Refund.Reason.USER_REQUEST, reason_detail=reason_detail,
                initiated_by=request.user,
            )
            if error:
                return error

        locked.status = Ticket.Status.CANCELLED
        locked.cancelled_at = timezone.now()
        locked.cancellation_reason = reason_detail
        locked.save(update_fields=["status", "cancelled_at", "cancellation_reason"])

        tier = locked.tier
        tier.sold_quantity = max(0, tier.sold_quantity - 1)
        tier.save(update_fields=["sold_quantity"])

        _release_ticket_allocation(locked)
        _sync_order_cancellation_status(locked.order)

    return Response(TicketSerializer(locked, context={"request": request}).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def transfer_ticket(request, pk):
    """Give this ticket to someone else who already has a Naada account.

    Reassigns the same row — same QR, same ticket number — rather than
    issuing a new one, so the door's check-in flow (which only ever cares
    about `status`, never who holds the ticket) needs no changes at all.
    `original_purchaser` is left untouched as the audit trail of who
    actually paid; `holder_*` and `user` move to whoever is meant to attend.
    """
    serializer = TransferTicketSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    d = serializer.validated_data

    ticket = generics.get_object_or_404(Ticket, pk=pk, user=request.user)
    if ticket.status != Ticket.Status.VALID:
        return Response(
            {"detail": f"This ticket is {ticket.get_status_display().lower()} and can't be transferred."},
            status=400,
        )

    recipient = User.objects.filter(email__iexact=d["recipient_email"]).first()
    if not recipient:
        return Response(
            {"detail": "No Naada account with that email — they'll need to sign up first."},
            status=404,
        )
    if recipient.id == request.user.id:
        return Response({"detail": "You already have this ticket."}, status=400)

    with transaction.atomic():
        locked = Ticket.objects.select_for_update().get(pk=ticket.pk)
        if locked.status != Ticket.Status.VALID:
            return Response(
                {"detail": f"This ticket is {locked.get_status_display().lower()} and can't be transferred."},
                status=400,
            )

        TicketTransfer.objects.create(
            ticket=locked, from_user=request.user, to_user=recipient,
            transfer_reason=d.get("reason", "")[:200],
        )
        locked.user = recipient
        locked.holder_name = recipient.name
        locked.holder_email = recipient.email
        locked.holder_phone = recipient.phone or ""
        locked.transfer_count += 1
        locked.save(update_fields=[
            "user", "holder_name", "holder_email", "holder_phone", "transfer_count",
        ])

    return Response(TicketSerializer(locked, context={"request": request}).data)


def works_the_door(user, event) -> bool:
    """Whether this user is allowed to admit people to this event.

    The check-in endpoint used to require nothing but a signed-in account, and
    a ticket's `qr_data` is effectively a bearer token — it is printed on the
    QR, and people screenshot their tickets and forward them. Anyone who
    received one of those images could burn the ticket before its holder
    reached the door, and the holder would arrive to "Ticket is used."
    """
    from . import gate

    if gate.is_organiser(user, event):
        return True
    # An invited gatekeeper — only for this event, only inside its window.
    return gate.gatekeeper_may_scan(user, event)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def event_attendees(request, event_id):
    """The door list for one event.

    The scanner's manual lookup — used when a phone is dead, which at a real
    door is often — had nothing to search: it filtered the store's tickets,
    and those are the *signed-in user's own* tickets, so a host searching for
    a guest found nothing unless they had bought a ticket to their own gig.
    """
    event = generics.get_object_or_404(Event, pk=event_id)
    if not works_the_door(request.user, event):
        from . import gate
        raise exceptions.PermissionDenied(gate.gate_denial_reason(request.user, event))

    tickets = (
        Ticket.objects.filter(event=event)
        .exclude(status=Ticket.Status.CANCELLED)
        .select_related("tier")
        .order_by("holder_name", "ticket_number")
    )
    return Response({
        "event": str(event.id),
        "count": tickets.count(),
        "results": AttendeeSerializer(tickets, many=True).data,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def scan_ticket(request, qr_data):
    from django.utils import timezone
    ticket = generics.get_object_or_404(
        Ticket.objects.select_related("event"), qr_data=qr_data
    )
    if not works_the_door(request.user, ticket.event):
        from . import gate
        raise exceptions.PermissionDenied(gate.gate_denial_reason(request.user, ticket.event))

    # Locked so two doors (or one door double-tapping a slow scan) can't both
    # read VALID before either write commits and admit the same ticket twice.
    with transaction.atomic():
        locked = Ticket.objects.select_for_update().get(pk=ticket.pk)
        if locked.status != Ticket.Status.VALID:
            return Response(
                {"valid": False, "detail": f"Ticket is {locked.get_status_display()}."},
                status=status.HTTP_400_BAD_REQUEST
            )
        locked.status = Ticket.Status.USED
        locked.checked_in_at = timezone.now()
        locked.checked_in_by = request.user
        locked.save(update_fields=["status", "checked_in_at", "checked_in_by"])
        ticket = locked
    from . import gate

    # An invited gatekeeper gets the same narrow view as the door list — name,
    # tier and seat — never the buyer's email and phone.
    if gate.is_organiser(request.user, ticket.event):
        data = TicketSerializer(ticket, context={"request": request}).data
    else:
        data = AttendeeSerializer(ticket).data
    return Response({"valid": True, "ticket": data})


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
