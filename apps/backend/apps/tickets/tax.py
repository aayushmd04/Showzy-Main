"""GST on ticket orders.

Everything here defaults to zero, so behaviour is unchanged until an operator
sets a rate. That is deliberate: the correct rate and treatment for event
ticketing in India is a question for a chartered accountant, not a guess in
code. What this module provides is the *mechanism*, so answering that question
becomes a config change rather than a development task.

The two components are taxed separately because they usually are:

  * the **booking fee** is a service Naada supplies, and
  * the **ticket face value** is the organiser's supply, which for admission to
    entertainment events is commonly exempt below a per-ticket threshold.

Both rates and the threshold are settings. Set GST_RATE_FEE and
GST_RATE_TICKET to the rates your CA confirms; leave them at 0 to sell exactly
as the platform does today.

Place of supply: this computes an intra-state split (CGST + SGST, half each),
which is the ordinary case for a Karnataka seller with Karnataka buyers. An
inter-state sale is IGST at the full rate on a single line — if Naada starts
selling meaningfully outside Karnataka, that distinction has to be made from
the buyer's state, and this is the one place to make it.
"""

from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings

PAISE = Decimal("0.01")


def _rate(name: str) -> Decimal:
    """A percentage from settings, as a Decimal. Absent or unset means zero."""
    raw = getattr(settings, name, 0) or 0
    try:
        return Decimal(str(raw))
    except Exception:  # pragma: no cover - defensive against a bad setting
        return Decimal("0")


def _round(amount: Decimal) -> Decimal:
    return amount.quantize(PAISE, rounding=ROUND_HALF_UP)


def compute_gst(*, ticket_subtotal: Decimal, booking_fee: Decimal, ticket_count: int) -> dict:
    """Return the GST breakdown for one order.

    `ticket_subtotal` is the face value of all paid tickets before discount;
    `booking_fee` is Naada's own fee. Returns zeros when no rate is configured,
    which is the shipped default.
    """
    fee_rate = _rate("GST_RATE_FEE")
    ticket_rate = _rate("GST_RATE_TICKET")
    exempt_below = _rate("GST_TICKET_EXEMPT_BELOW")

    fee_gst = _round(booking_fee * fee_rate / 100) if booking_fee > 0 else Decimal("0")

    # Admission is commonly exempt below a per-ticket price, so the threshold is
    # tested against the price of a single ticket, not the order total.
    ticket_gst = Decimal("0")
    if ticket_rate > 0 and ticket_subtotal > 0 and ticket_count > 0:
        per_ticket = ticket_subtotal / Decimal(ticket_count)
        if exempt_below <= 0 or per_ticket >= exempt_below:
            ticket_gst = _round(ticket_subtotal * ticket_rate / 100)

    total = _round(fee_gst + ticket_gst)
    half = _round(total / 2)

    return {
        "total": total,
        # The halves must add back to the total exactly, so the second absorbs
        # any rounding remainder rather than both being rounded independently.
        "cgst": half,
        "sgst": _round(total - half),
        "igst": Decimal("0"),
        "on_fee": fee_gst,
        "on_tickets": ticket_gst,
        "rate_fee": fee_rate,
        "rate_ticket": ticket_rate,
        "is_configured": bool(fee_rate or ticket_rate),
    }
