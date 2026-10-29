"""What Showzy owes an event's organiser for ticket sales.

Every ticket payment lands in Showzy's own gateway account, so the organiser's
share has to be worked out here and paid out by hand.

    collected   successful payments for the event
  − refunded    refunds the gateway has completed
  − Showzy fee   the booking fee on orders that were not refunded in full
  = owed        ticket money belonging to the organiser

`taxes` is reported but not deducted: the tax on Showzy's fee is Showzy's to
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


def payout_readiness(user) -> dict:
    """Whether Showzy can actually send this host money yet, and if not, why.

    Ticket money is paid to the bank account on the host's venue once its KYC is
    verified (the same gate `Venue.can_receive_payouts` applies). Saying so
    plainly, before the first night sells out, beats a host discovering it when
    the money does not arrive.
    """
    from apps.venues.models import Venue

    venues = list(Venue.objects.filter(owner=user, is_deleted=False))
    if any(v.can_receive_payouts for v in venues):
        ready = next(v for v in venues if v.can_receive_payouts)
        return {"ready": True, "blocker": "", "account_last4": ready.bank_account_last4,
                "account_holder": ready.bank_account_holder_name}
    if not venues:
        return {"ready": False, "blocker": "no_venue", "account_last4": "", "account_holder": ""}
    venue = venues[0]
    if not venue.has_bank_details:
        blocker = "no_bank_details"
    elif venue.kyc_status == "rejected":
        blocker = "kyc_rejected"
    else:
        blocker = "kyc_pending"
    return {"ready": False, "blocker": blocker, "account_last4": venue.bank_account_last4,
            "account_holder": venue.bank_account_holder_name}


def host_statement(user) -> dict:
    """Every night this host has taken money for: what came in, what Showzy kept,
    what has been paid to them (with the bank reference) and what is still owed."""
    from apps.events.models import Event
    from apps.tickets.models import Ticket

    totals = {k: ZERO for k in
              ("collected", "refunded", "naada_fee", "owed_to_organiser", "paid_out", "balance")}
    rows = []
    events = Event.objects.filter(organizer=user, is_deleted=False).order_by("-start_datetime")
    for event in events:
        summary = event_payout_summary(event)
        payouts = list(OrganizerPayout.objects.filter(event=event).order_by("-paid_at"))
        sold = (Ticket.objects.filter(event=event)
                .exclude(status=Ticket.Status.CANCELLED).count())
        if summary["collected"] == ZERO and not payouts and not sold:
            continue  # a draft, or a night nobody has bought for yet
        for key in totals:
            totals[key] += summary[key]
        rows.append({
            "event_id": str(event.id),
            "title": event.title,
            "start_datetime": event.start_datetime.isoformat(),
            "status": event.status,
            "tickets_sold": sold,
            **{k: summary[k] for k in totals},
            "payouts": [{
                "id": str(p.id),
                "amount": p.amount,
                "reference": p.reference,
                "paid_at": p.paid_at.isoformat(),
                "note": p.note,
            } for p in payouts],
        })
    return {"totals": totals, "events": rows, "payout_account": payout_readiness(user)}
