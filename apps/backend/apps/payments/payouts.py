"""What Naada owes an event's organiser for ticket sales.

Every ticket payment lands in Naada's own gateway account, so the organiser's
share has to be worked out here and paid out by hand.

    collected   successful payments for the event
  − refunded    refunds the gateway has completed
  − Naada fee   the booking fee on orders that were not refunded in full
  = owed        ticket money belonging to the organiser

`taxes` is reported but not deducted: the tax on Naada's fee is Naada's to
remit, the tax on admission is the organiser's, and the order stores one
combined figure. Until GST is configured it is zero; once it is, split it
before paying anyone.
"""

from decimal import Decimal

from django.db.models import Sum

from .models import OrganizerPayout, Payment, PaymentStatus, Refund

ZERO = Decimal("0.00")
COUNTED = (PaymentStatus.SUCCESS, PaymentStatus.PARTIALLY_REFUNDED, PaymentStatus.REFUNDED)


def event_payout_summary(event) -> dict:
    payments = (Payment.objects.filter(order__event=event, status__in=COUNTED)
                .select_related("order"))
    collected = payments.aggregate(t=Sum("amount"))["t"] or ZERO
    refunded = (Refund.objects.filter(order__event=event, status=Refund.Status.SUCCESS)
                .aggregate(t=Sum("amount"))["t"] or ZERO)

    fee = taxes = ZERO
    seen = set()
    for p in payments:
        if p.order_id in seen or p.status == PaymentStatus.REFUNDED:
            continue
        seen.add(p.order_id)
        fee += p.order.platform_fee
        taxes += p.order.taxes

    paid_out = (OrganizerPayout.objects.filter(event=event)
                .aggregate(t=Sum("amount"))["t"] or ZERO)
    owed = collected - refunded - fee
    return {k: (v if k == "event" else Decimal(v).quantize(ZERO)) for k, v in {
        "event": str(event.id),
        "collected": collected,
        "refunded": refunded,
        "naada_fee": fee,
        "taxes_included_in_collected": taxes,
        "owed_to_organiser": owed,
        "paid_out": paid_out,
        "balance": owed - paid_out,}.items()}
