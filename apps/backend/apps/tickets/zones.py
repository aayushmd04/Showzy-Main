"""Bookable zones, derived from the venue's floor plan.

The host console's layout designer writes a list of labelled elements onto
`Venue.layout` — a stage, some tables, a dance floor, a VIP section — each with
a capacity and a position expressed as a percentage of the canvas. This module
is the single place that reads that JSON and turns it into something checkout
can sell.

Two deliberate limits:

* **Zone level by default, seat level when the host draws seats.** A table
  the host has only given a headcount ("Table A seats 6") stays a zone, and a
  buyer claims a quantity from it exactly as before. A table the host has
  placed named seats/furniture on ("chair", "sofa", "bench", walked around the
  table's `shape` at position `t`) becomes seat-level: a buyer claims specific
  seat ids, and `capacity` is then derived from the seat list rather than the
  typed-in number. Every other zone type (VIP, dance floor, stage) is
  unaffected either way.
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
STRUCTURAL_TYPES = frozenset({"stage", "entrance", "exit", "restroom", "speaker"})

#: Most baby (high) chairs a single table can offer. Stops a typo'd 500 from
#: turning into an absurd add-on count on the buyer's screen.
MAX_BABY_CHAIRS = 8

#: Field widths, matched to ZoneAllocation / Ticket.seat_label.
ZONE_ID_MAX = 64
ZONE_LABEL_MAX = 40

#: Table shapes the host editor can draw. Anything else falls back to round,
#: which is what every table drawn before this field existed looks like.
TABLE_SHAPES = frozenset({"round", "square", "rectangle"})

#: Furniture a seat can be. Purely descriptive — the backend attaches no
#: business meaning to it beyond "this is one bookable place".
SEAT_FURNITURE = frozenset({"chair", "sofa", "bench"})

SEAT_ID_MAX = 64


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _clamp(value, low, high):
    return max(low, min(high, value))


def _normalise_seat(raw):
    """One seat on a table, or None if it is unusable.

    Same defensive posture as `_normalise`: the layout is host-authored JSON
    that may predate this field, so a malformed seat is skipped rather than
    allowed to break a sale.
    """
    if not isinstance(raw, dict):
        return None
    seat_id = str(raw.get("id") or "").strip()[:SEAT_ID_MAX]
    if not seat_id:
        return None

    furniture = str(raw.get("furniture") or "chair").strip().lower()
    if furniture not in SEAT_FURNITURE:
        furniture = "chair"

    group_id = raw.get("groupId")
    group_id = str(group_id).strip() if group_id not in (None, "") else None

    return {
        "id": seat_id,
        "t": _clamp(_num(raw.get("t"), 0), 0, 1),
        "furniture": furniture,
        "groupId": group_id,
    }


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

    element = {
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
        # "round" for every non-table zone too (the field is meaningless there,
        # but ZoneSerializer expects every zone dict to carry it).
        "shape": "round",
        "baby_chairs_total": 0,
        # Facility count (restroom cubicles, speaker units); purely descriptive.
        "count": max(0, min(99, int(_num(raw.get("count"), 0)))),
    }

    if zone_type == "table":
        shape = str(raw.get("shape") or "round").strip().lower()
        if shape not in TABLE_SHAPES:
            shape = "round"
        element["shape"] = shape

        seats = []
        seen_seat_ids = set()
        for seat_raw in raw.get("seats") or []:
            seat = _normalise_seat(seat_raw)
            if seat and seat["id"] not in seen_seat_ids:
                seen_seat_ids.add(seat["id"])
                seats.append(seat)
        element["seats"] = seats
        element["baby_chairs_total"] = max(
            0, min(MAX_BABY_CHAIRS, int(_num(raw.get("babyChairs"), 0)))
        )

        if seats:
            # Seats are the source of truth for a table's capacity once the
            # host has placed any — the typed-in number was only ever a
            # stand-in for "however many chairs actually fit".
            element["capacity"] = len(seats)
            element["bookable"] = zone_type not in STRUCTURAL_TYPES

    return element


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


def _live_allocations(event):
    """`ZoneAllocation` rows that still count against a zone's capacity.

    Shared by `taken_by_zone` and `taken_seat_ids_by_zone` so the two can never
    diverge on what "still live" means: issued tickets and live checkout holds
    both count, and a hold stops counting the moment its order expires, is
    cancelled, or is swept by `release_expired_orders`.
    """
    from .models import Order, ZoneAllocation

    live_statuses = [
        Order.Status.INITIATED,
        Order.Status.PAYMENT_PENDING,
        Order.Status.CONFIRMED,
        Order.Status.PARTIALLY_CANCELLED,
    ]
    unpaid = [Order.Status.INITIATED, Order.Status.PAYMENT_PENDING]

    return ZoneAllocation.objects.filter(
        event=event,
        status=ZoneAllocation.Status.HELD,
        order__status__in=live_statuses,
    ).exclude(order__status__in=unpaid, order__expires_at__lt=timezone.now())


def taken_by_zone(event):
    """Places already spoken for in each zone of this event, keyed by zone id.

    Counts both issued tickets and live checkout holds, because from the next
    buyer's point of view there is no difference — the chair is claimed either
    way. A hold stops counting the moment its order expires, is cancelled, or
    is swept by `release_expired_orders`; the clock is honoured here as well as
    by the sweeper so that availability is right even when the worker is down.
    """
    rows = _live_allocations(event).values("zone_id").annotate(total=Sum("quantity"))
    return {row["zone_id"]: row["total"] or 0 for row in rows}


def taken_seat_ids_by_zone(event):
    """Specific seat ids already spoken for, keyed by zone id.

    Mirrors `taken_by_zone` exactly — same live/expiry filtering — but instead
    of a headcount it returns which named seats are held, for zones that book
    at the seat level.
    """
    taken = {}
    for row in _live_allocations(event).values("zone_id", "seat_ids"):
        zone_id = row["zone_id"]
        seat_ids = row["seat_ids"] or []
        bucket = taken.setdefault(zone_id, set())
        for seat in seat_ids:
            seat_id = seat.get("id") if isinstance(seat, dict) else None
            if seat_id:
                bucket.add(seat_id)
    return taken


def taken_baby_chairs_by_zone(event):
    """Baby chairs already claimed per zone — same liveness rules as seats."""
    rows = _live_allocations(event).values("zone_id").annotate(total=Sum("baby_chairs"))
    return {row["zone_id"]: row["total"] or 0 for row in rows}


def zone_availability(event):
    """Every layout element for an event, with live availability on the
    bookable ones. Empty list when the venue has no floor plan."""
    elements = elements_for_event(event)
    if not elements:
        return []

    any_bookable = any(e["bookable"] for e in elements)
    taken_map = taken_by_zone(event) if any_bookable else {}
    any_seats = any(e.get("seats") for e in elements)
    taken_seats_map = taken_seat_ids_by_zone(event) if any_seats else {}
    any_baby = any(e.get("baby_chairs_total") for e in elements)
    taken_baby_map = taken_baby_chairs_by_zone(event) if any_baby else {}

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

        baby_total = zone.get("baby_chairs_total", 0)
        zone["baby_chairs_available"] = max(
            0, baby_total - taken_baby_map.get(zone["id"], 0)
        ) if baby_total else 0

        seats = element.get("seats") or []
        if seats:
            taken_seat_ids = taken_seats_map.get(zone["id"], set())
            zone["seats"] = [
                {
                    "id": seat["id"],
                    "t": seat["t"],
                    "furniture": seat["furniture"],
                    "groupId": seat["groupId"],
                    "label": f"Seat {i + 1}",
                    "taken": seat["id"] in taken_seat_ids,
                }
                for i, seat in enumerate(seats)
            ]
        else:
            # Always present, even for zones with no seats at all, so the
            # frontend never has to branch on the key's absence.
            zone["seats"] = []
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


def find_seats(zone, seat_ids):
    """The requested seats from this zone, in the order requested.

    Returns None — rather than a partial list — if any requested id is not a
    seat in this zone, or if any requested seat is already taken. Checkout
    treats both cases identically: "pick again", not "here is what's left".
    """
    if not seat_ids or len(set(seat_ids)) != len(seat_ids):
        return None
    by_id = {seat["id"]: seat for seat in (zone.get("seats") or [])}
    matched = []
    for seat_id in seat_ids:
        seat = by_id.get(seat_id)
        if seat is None or seat.get("taken"):
            return None
        matched.append({
            "id": seat["id"],
            "label": seat["label"],
            "furniture": seat["furniture"],
        })
    return matched
