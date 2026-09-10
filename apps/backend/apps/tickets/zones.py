"""Bookable zones, derived from the venue's floor plan.

The host console's layout designer writes a list of labelled elements onto
`Venue.layout` — a stage, some tables, a dance floor, a VIP section — each with
a capacity and a position expressed as a percentage of the canvas. This module
is the single place that reads that JSON and turns it into something checkout
can sell.

Two deliberate limits:

* **Zone level, not seat level.** The designer produces areas with a capacity
  each ("Table A seats 6"), not numbered chairs, so that is exactly what a
  buyer can claim. "The table by the stage" is answerable; "seat 4B" is not,
  and pretending otherwise would need a different editor.
* **Optional.** A standing-room open mic has no layout at all. Every function
  here returns empty for such an event, and checkout carries on unchanged.

Nothing is validated on the way in — the layout is host-authored JSON that may
predate any given field — so every read is defensive and a malformed element is
skipped rather than allowed to break a sale.
"""

from django.db.models import Sum
from django.utils import timezone

#: Elements that describe the room rather than offer a place to sit. A host can
#: type a capacity onto a stage; it still is not something a buyer can book.
STRUCTURAL_TYPES = frozenset({"stage", "entrance", "exit"})

#: Field widths, matched to ZoneAllocation / Ticket.seat_label.
ZONE_ID_MAX = 64
ZONE_LABEL_MAX = 40


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, low, high):
    return max(low, min(high, value))


def _normalise(raw):
    """One layout element as the API exposes it, or None if it is unusable."""
    if not isinstance(raw, dict):
        return None
    zone_id = str(raw.get("id") or "").strip()[:ZONE_ID_MAX]
    if not zone_id:
        return None

    zone_type = str(raw.get("type") or "seating").strip()[:30]
    label = str(raw.get("label") or zone_type.replace("_", " ").title()).strip()[:ZONE_LABEL_MAX]

    try:
        capacity = max(0, int(_num(raw.get("capacity"), 0)))
    except (ValueError, OverflowError):
        capacity = 0

    return {
        "id": zone_id,
        "label": label,
        "type": zone_type,
        "x": _clamp(_num(raw.get("x")), 0, 100),
        "y": _clamp(_num(raw.get("y")), 0, 100),
        "w": _clamp(_num(raw.get("w"), 10), 0.5, 100),
        "h": _clamp(_num(raw.get("h"), 10), 0.5, 100),
        "capacity": capacity,
        # A capacity of zero means the host never said how many fit, so there
        # is nothing to sell and nothing to oversell.
        "bookable": capacity > 0 and zone_type not in STRUCTURAL_TYPES,
    }


def layout_elements(venue):
    """Normalised elements from a venue's stored floor plan.

    Accepts both shapes seen in the wild: the documented
    ``{"version": 1, "elements": [...]}`` wrapper and a bare list.
    """
    layout = getattr(venue, "layout", None)
    if isinstance(layout, dict):
        raw = layout.get("elements")
    elif isinstance(layout, list):
        raw = layout
    else:
        raw = None

    if not isinstance(raw, list):
        return []

    seen = set()
    elements = []
    for item in raw:
        element = _normalise(item)
        if element and element["id"] not in seen:
            seen.add(element["id"])
            elements.append(element)
    return elements


def elements_for_event(event):
    venue = getattr(event, "venue", None)
    return layout_elements(venue) if venue else []


def taken_by_zone(event):
    """Places already spoken for in each zone of this event, keyed by zone id.

    Counts both issued tickets and live checkout holds, because from the next
    buyer's point of view there is no difference — the chair is claimed either
    way. A hold stops counting the moment its order expires, is cancelled, or
    is swept by `release_expired_orders`; the clock is honoured here as well as
    by the sweeper so that availability is right even when the worker is down.
    """
    from .models import Order, ZoneAllocation

    live_statuses = [
        Order.Status.INITIATED,
        Order.Status.PAYMENT_PENDING,
        Order.Status.CONFIRMED,
        Order.Status.PARTIALLY_CANCELLED,
    ]
    unpaid = [Order.Status.INITIATED, Order.Status.PAYMENT_PENDING]

    rows = (
        ZoneAllocation.objects.filter(
            event=event,
            status=ZoneAllocation.Status.HELD,
            order__status__in=live_statuses,
        )
        .exclude(order__status__in=unpaid, order__expires_at__lt=timezone.now())
        .values("zone_id")
        .annotate(total=Sum("quantity"))
    )
    return {row["zone_id"]: row["total"] or 0 for row in rows}


def zone_availability(event):
    """Every layout element for an event, with live availability on the
    bookable ones. Empty list when the venue has no floor plan."""
    elements = elements_for_event(event)
    if not elements:
        return []

    taken_map = taken_by_zone(event) if any(e["bookable"] for e in elements) else {}

    zones = []
    for element in elements:
        zone = dict(element)
        if zone["bookable"]:
            taken = min(taken_map.get(zone["id"], 0), zone["capacity"])
            zone["taken"] = taken
            zone["available"] = max(0, zone["capacity"] - taken)
        else:
            zone["taken"] = 0
            zone["available"] = 0
        zones.append(zone)
    return zones


def find_zone(event, zone_id):
    """One zone with its availability, or None if this event has no such zone."""
    if not zone_id:
        return None
    for zone in zone_availability(event):
        if zone["id"] == zone_id:
            return zone
    return None
