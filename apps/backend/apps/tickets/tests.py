"""Tests for ticket pricing.

These cover the arithmetic that decides what a buyer is charged. Everything
here was silently wrong at some point today — the booking fee was hardcoded to
zero while the UI displayed one, and GST had no mechanism at all — so the point
is to make the next silent change loud.
"""

from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from apps.tickets.tax import compute_gst


class GstDefaultsTests(SimpleTestCase):
    """Shipped defaults must charge nothing. Anything else is a surprise bill."""

    def test_no_rates_configured_means_no_tax(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("38"), ticket_count=2
        )
        self.assertEqual(gst["total"], Decimal("0"))
        self.assertFalse(gst["is_configured"])

    def test_free_order_is_never_taxed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("0"), booking_fee=Decimal("0"), ticket_count=3
        )
        self.assertEqual(gst["total"], Decimal("0"))


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=0, GST_TICKET_EXEMPT_BELOW=0)
class GstOnFeeOnlyTests(SimpleTestCase):
    """The common starting point: tax our own service, leave admission alone."""

    def test_fee_is_taxed_and_tickets_are_not(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("100"), ticket_count=2
        )
        self.assertEqual(gst["on_fee"], Decimal("18.00"))
        self.assertEqual(gst["on_tickets"], Decimal("0"))
        self.assertEqual(gst["total"], Decimal("18.00"))

    def test_split_halves_add_back_to_the_total_exactly(self):
        # An odd total is where naive rounding loses a paisa.
        gst = compute_gst(
            ticket_subtotal=Decimal("0"), booking_fee=Decimal("19"), ticket_count=1
        )
        self.assertEqual(gst["cgst"] + gst["sgst"], gst["total"])


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=18, GST_TICKET_EXEMPT_BELOW=500)
class GstExemptionThresholdTests(SimpleTestCase):
    """Admission is commonly exempt below a per-ticket price, not an order total."""

    def test_cheap_tickets_are_exempt_even_when_the_order_is_large(self):
        # Ten tickets at Rs 200 is a Rs 2,000 order made of exempt tickets.
        gst = compute_gst(
            ticket_subtotal=Decimal("2000"), booking_fee=Decimal("0"), ticket_count=10
        )
        self.assertEqual(gst["on_tickets"], Decimal("0"))

    def test_tickets_at_or_above_the_threshold_are_taxed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("0"), ticket_count=2
        )
        self.assertEqual(gst["on_tickets"], Decimal("180.00"))

    def test_the_threshold_reads_per_ticket_not_per_order(self):
        one_expensive = compute_gst(
            ticket_subtotal=Decimal("600"), booking_fee=Decimal("0"), ticket_count=1
        )
        three_cheap = compute_gst(
            ticket_subtotal=Decimal("600"), booking_fee=Decimal("0"), ticket_count=3
        )
        self.assertGreater(one_expensive["on_tickets"], Decimal("0"))
        self.assertEqual(three_cheap["on_tickets"], Decimal("0"))


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=18, GST_TICKET_EXEMPT_BELOW=0)
class GstOnEverythingTests(SimpleTestCase):
    def test_both_components_are_taxed_and_summed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("100"), ticket_count=2
        )
        self.assertEqual(gst["on_tickets"], Decimal("180.00"))
        self.assertEqual(gst["on_fee"], Decimal("18.00"))
        self.assertEqual(gst["total"], Decimal("198.00"))
        self.assertTrue(gst["is_configured"])

    def test_discount_is_taxed_on_what_is_actually_paid(self):
        """The caller passes the post-discount subtotal, so a promo reduces tax."""
        full = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("0"), ticket_count=1
        )
        discounted = compute_gst(
            ticket_subtotal=Decimal("800"), booking_fee=Decimal("0"), ticket_count=1
        )
        self.assertEqual(full["on_tickets"], Decimal("180.00"))
        self.assertEqual(discounted["on_tickets"], Decimal("144.00"))


# ─────────────────────────────────────────────────────────────────────────────
# Floor-plan zones
#
# A host can already draw their room — tables, a VIP section, a dance floor,
# each with a capacity. These cover what happens when a buyer picks one of
# those at checkout. Three things must hold: a zone cannot be oversold, an
# abandoned checkout gives its places back, and an event with no floor plan at
# all sells exactly as it always has.
# ─────────────────────────────────────────────────────────────────────────────

import uuid as _uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import City
from apps.events.models import Event, EventStatus
from apps.tickets import zones as zone_map
from apps.tickets.models import Order, OrderItem, Ticket, TicketTier, ZoneAllocation
from apps.tickets.tasks import release_expired_orders
from apps.venues.models import Venue

FLOOR_PLAN = {
    "version": 1,
    "elements": [
        {"id": "s1", "type": "stage", "x": 33, "y": 4, "w": 34, "h": 14,
         "label": "Main Stage", "capacity": 0},
        {"id": "t1", "type": "table", "x": 7, "y": 30, "w": 10, "h": 10,
         "label": "Table A", "capacity": 4},
        {"id": "v1", "type": "vip", "x": 72, "y": 60, "w": 22, "h": 20,
         "label": "VIP Section", "capacity": 20},
    ],
}


class ZoneTestCase(TestCase):
    """One gig at a venue with a floor plan, and one at a venue without."""

    def setUp(self):
        User = get_user_model()
        self.host = User.objects.create_user(
            email="zone-host@naada.test", full_name="Meera Rao", phone="+919000000090")
        self.buyer = User.objects.create_user(
            email="zone-buyer@naada.test", full_name="Anita Shetty", phone="+919000000091")
        self.city = City.objects.create(name="Mysuru", slug="mysuru-zones")

        self.venue = Venue.objects.create(
            owner=self.host, name="Gokulam Music Hall", slug="gokulam-zones",
            address_line1="12, 4th Main", city=self.city, capacity=120,
            layout=FLOOR_PLAN)
        self.event = self.make_event(self.venue, "Rahul & The Mysore Blues")
        self.tier = self.make_tier(self.event)

        # The open mic: a room with no plan drawn for it at all.
        self.bare_venue = Venue.objects.create(
            owner=self.host, name="Backyard Cafe", slug="backyard-zones",
            address_line1="3 Cross", city=self.city, capacity=40)
        self.bare_event = self.make_event(self.bare_venue, "Tuesday Open Mic")
        self.bare_tier = self.make_tier(self.bare_event)

        self.client = APIClient()
        self.client.force_authenticate(user=self.buyer)

    # ── helpers ──────────────────────────────────────────────────────────────

    def make_event(self, venue, title):
        return Event.objects.create(
            organizer=self.host, venue=venue, title=title,
            status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=7),
            end_datetime=timezone.now() + timedelta(days=7, hours=3))

    def make_tier(self, event):
        return TicketTier.objects.create(
            event=event, name="General", price=Decimal("400.00"), total_quantity=100)

    def order(self, quantity=1, zone_id=None, event=None, tier=None, seat_ids=None):
        """POST the checkout the frontend posts. Returns the DRF response."""
        event = event or self.event
        tier = tier or self.tier
        body = {"event_id": str(event.id),
                "items": [{"tier_id": str(tier.id), "quantity": quantity}]}
        if zone_id is not None:
            body["zone_id"] = zone_id
        if seat_ids is not None:
            body["seat_ids"] = seat_ids
        return self.client.post(reverse("orders-create"), body, format="json")

    def zones(self, event=None):
        resp = self.client.get(reverse("event-zones", args=[(event or self.event).id]))
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data

    def zone(self, zone_id, event=None):
        return next(z for z in self.zones(event)["zones"] if z["id"] == zone_id)

    def issue_tickets(self, order):
        """Stand in for payment confirmation, which is where tickets are made."""
        for item in order.items.all():
            for _ in range(item.quantity):
                Ticket.objects.create(
                    order=order, order_item=item, user=order.user, event=order.event,
                    tier=item.tier,
                    ticket_number=f"ZN{_uuid.uuid4().hex[:8].upper()}")
        order.status = Order.Status.CONFIRMED
        order.confirmed_at = timezone.now()
        order.save(update_fields=["status", "confirmed_at"])


class EventTimingGuardTests(ZoneTestCase):
    """An event that's already over, or cancelled, has nothing left to sell —
    checked out here, not left to the frontend, since this is the one place
    an order actually gets created.
    """

    def test_cannot_order_a_ticket_for_an_event_that_already_happened(self):
        past_start = timezone.now() - timedelta(days=2)
        self.event.start_datetime = past_start
        self.event.end_datetime = past_start + timedelta(hours=3)
        self.event.save(update_fields=["start_datetime", "end_datetime"])

        resp = self.order()
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(Order.objects.filter(event=self.event).count(), 0)

    def test_cannot_order_a_ticket_for_a_cancelled_event(self):
        self.event.status = EventStatus.CANCELLED
        self.event.save(update_fields=["status"])

        resp = self.order()
        self.assertEqual(resp.status_code, 400, resp.data)
        self.assertEqual(Order.objects.filter(event=self.event).count(), 0)

    def test_can_still_order_a_ticket_for_an_upcoming_event(self):
        resp = self.order()
        self.assertEqual(resp.status_code, 201, resp.data)


class ZoneLayoutReadingTests(ZoneTestCase):
    """The layout is host-authored JSON, so reading it must never throw."""

    def test_structural_elements_are_never_bookable(self):
        stage = self.zone("s1")
        self.assertFalse(stage["bookable"])
        # It is still returned: a plan without its stage is unreadable.
        self.assertEqual(stage["label"], "Main Stage")

    def test_a_zone_without_a_capacity_is_not_bookable(self):
        self.venue.layout = {"elements": [
            {"id": "d1", "type": "dance_floor", "label": "Dance Floor", "capacity": 0}]}
        self.venue.save(update_fields=["layout"])
        self.assertFalse(self.zone("d1")["bookable"])

    def test_a_bare_list_layout_is_read_the_same_as_the_wrapped_one(self):
        self.venue.layout = FLOOR_PLAN["elements"]
        self.venue.save(update_fields=["layout"])
        self.assertEqual(len(self.zones()["zones"]), 3)

    def test_junk_in_the_layout_is_skipped_not_fatal(self):
        self.venue.layout = {"elements": [
            "not a dict",
            {"no": "id"},
            {"id": "t1", "label": "Table A", "capacity": "6", "x": "12", "w": None},
        ]}
        self.venue.save(update_fields=["layout"])
        zones = self.zones()["zones"]
        self.assertEqual(len(zones), 1)
        self.assertEqual(zones[0]["capacity"], 6)
        self.assertEqual(zones[0]["x"], 12)

    def test_an_event_whose_venue_has_no_plan_reports_no_layout(self):
        data = self.zones(self.bare_event)
        self.assertFalse(data["has_layout"])
        self.assertEqual(data["zones"], [])


class ZoneCapacityTests(ZoneTestCase):
    """A zone can only be chosen while it has room."""

    def test_choosing_a_zone_holds_places_in_it(self):
        resp = self.order(quantity=2, zone_id="t1")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["zone"]["zone_label"], "Table A")
        self.assertEqual(resp.data["zone"]["quantity"], 2)
        self.assertEqual(self.zone("t1")["available"], 2)

    def test_a_zone_cannot_be_oversold(self):
        self.assertEqual(self.zone("t1")["available"], 4)
        self.assertEqual(self.order(quantity=3, zone_id="t1").status_code, 201)

        resp = self.order(quantity=2, zone_id="t1")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Only 1 place left in Table A", str(resp.data["detail"]))
        self.assertEqual(self.zone("t1")["available"], 1)

        # The last place is still genuinely for sale.
        self.assertEqual(self.order(quantity=1, zone_id="t1").status_code, 201)
        self.assertEqual(self.zone("t1")["available"], 0)

        full = self.order(quantity=1, zone_id="t1")
        self.assertEqual(full.status_code, 400)
        self.assertIn("fully booked", str(full.data["detail"]))

    def test_a_rejected_zone_does_not_swallow_tier_inventory(self):
        """The tier is reserved before the zone is checked, so a refusal has to
        unwind it — otherwise a failed attempt would quietly shrink the gig."""
        self.order(quantity=4, zone_id="t1")
        before = TicketTier.objects.get(pk=self.tier.pk).reserved_quantity

        self.assertEqual(self.order(quantity=1, zone_id="t1").status_code, 400)

        self.assertEqual(TicketTier.objects.get(pk=self.tier.pk).reserved_quantity, before)
        self.assertEqual(Order.objects.filter(user=self.buyer).count(), 1)

    def test_tickets_already_issued_keep_their_places_taken(self):
        resp = self.order(quantity=2, zone_id="t1")
        order = Order.objects.get(pk=resp.data["id"])
        self.issue_tickets(order)
        self.assertEqual(self.zone("t1")["available"], 2)

    def test_an_unknown_or_unbookable_zone_is_refused(self):
        unknown = self.order(zone_id="does-not-exist")
        self.assertEqual(unknown.status_code, 400)
        self.assertIn("no longer part of this venue's layout", str(unknown.data["detail"]))

        stage = self.order(zone_id="s1")
        self.assertEqual(stage.status_code, 400)
        self.assertIn("isn't a bookable area", str(stage.data["detail"]))

    def test_zones_are_counted_separately(self):
        self.order(quantity=4, zone_id="t1")
        self.assertEqual(self.zone("t1")["available"], 0)
        self.assertEqual(self.zone("v1")["available"], 20)


class ZoneReleaseTests(ZoneTestCase):
    """An abandoned checkout must give the good table back."""

    def test_an_expired_order_frees_its_held_places(self):
        resp = self.order(quantity=4, zone_id="t1")
        order = Order.objects.get(pk=resp.data["id"])
        self.assertEqual(self.zone("t1")["available"], 0)

        order.expires_at = timezone.now() - timedelta(minutes=1)
        order.save(update_fields=["expires_at"])

        self.assertEqual(release_expired_orders(), 1)

        allocation = ZoneAllocation.objects.get(order=order)
        self.assertEqual(allocation.status, ZoneAllocation.Status.RELEASED)
        self.assertIsNotNone(allocation.released_at)
        self.assertEqual(self.zone("t1")["available"], 4)

        # And the table can be sold again, in full.
        self.assertEqual(self.order(quantity=4, zone_id="t1").status_code, 201)

    def test_a_lapsed_hold_stops_blocking_even_before_the_sweeper_runs(self):
        resp = self.order(quantity=4, zone_id="t1")
        Order.objects.filter(pk=resp.data["id"]).update(
            expires_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(self.zone("t1")["available"], 4)

    def test_a_confirmed_order_is_never_released(self):
        resp = self.order(quantity=4, zone_id="t1")
        order = Order.objects.get(pk=resp.data["id"])
        self.issue_tickets(order)
        Order.objects.filter(pk=order.pk).update(
            expires_at=timezone.now() - timedelta(minutes=1))

        release_expired_orders()

        self.assertEqual(
            ZoneAllocation.objects.get(order=order).status, ZoneAllocation.Status.HELD)
        self.assertEqual(self.zone("t1")["available"], 0)


class ZoneOnTicketTests(ZoneTestCase):
    """The choice has to reach the door, or it was decoration."""

    def test_the_zone_lands_on_every_ticket_in_the_order(self):
        resp = self.order(quantity=2, zone_id="v1")
        order = Order.objects.get(pk=resp.data["id"])
        self.issue_tickets(order)

        labels = list(order.tickets.values_list("seat_label", flat=True))
        self.assertEqual(labels, ["VIP Section", "VIP Section"])

    def test_a_ticket_without_a_chosen_zone_has_no_seat_label(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.issue_tickets(order)
        self.assertEqual(order.tickets.first().seat_label, "")


class NoLayoutCheckoutTests(ZoneTestCase):
    """The open mic must keep working exactly as it does today."""

    def test_an_event_without_a_layout_still_orders_normally(self):
        resp = self.order(quantity=2, event=self.bare_event, tier=self.bare_tier)

        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNone(resp.data["zone"])
        order = Order.objects.get(pk=resp.data["id"])
        self.assertFalse(ZoneAllocation.objects.filter(order=order).exists())
        self.assertEqual(order.items.first().quantity, 2)

    def test_an_empty_zone_id_means_no_preference_rather_than_an_error(self):
        resp = self.order(quantity=1, zone_id="", event=self.event)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertIsNone(resp.data["zone"])

    def test_a_zone_cannot_be_borrowed_from_a_different_event(self):
        resp = self.order(zone_id="t1", event=self.bare_event, tier=self.bare_tier)
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(ZoneAllocation.objects.exists())


# ─────────────────────────────────────────────────────────────────────────────
# Per-seat booking
#
# A table can now carry named seats (chairs/sofas/benches walked around its
# shape). When it does, a buyer claims specific seats rather than a bare
# quantity, and the zone's capacity is derived from the seat list. A table
# with no seats, and every non-table zone, must go on behaving exactly as
# ZoneTestCase above already proves.
# ─────────────────────────────────────────────────────────────────────────────

SEATED_FLOOR_PLAN = {
    "version": 1,
    "elements": [
        {"id": "st1", "type": "table", "shape": "round", "x": 7, "y": 30,
         "w": 10, "h": 10, "label": "Table A", "capacity": 6,
         "seats": [
             {"id": "st1-s1", "t": 0.0, "furniture": "chair", "groupId": None},
             {"id": "st1-s2", "t": 0.33, "furniture": "chair", "groupId": None},
             {"id": "st1-s3", "t": 0.66, "furniture": "sofa", "groupId": "st1-g1"},
         ]},
        {"id": "t2", "type": "table", "x": 40, "y": 30, "w": 10, "h": 10,
         "label": "Table B", "capacity": 4},
        {"id": "v1", "type": "vip", "x": 72, "y": 60, "w": 22, "h": 20,
         "label": "VIP Section", "capacity": 20},
    ],
}


class SeatTestCase(ZoneTestCase):
    """Adds a venue whose floor plan has a seated table, on top of the
    whole-zone fixtures ZoneTestCase already sets up."""

    def setUp(self):
        super().setUp()
        self.seated_venue = Venue.objects.create(
            owner=self.host, name="Nadaprabhu Hall", slug="nadaprabhu-seats",
            address_line1="9, Palace Road", city=self.city, capacity=150,
            layout=SEATED_FLOOR_PLAN)
        self.seated_event = self.make_event(self.seated_venue, "Kavya & The Ragas")
        self.seated_tier = self.make_tier(self.seated_event)

    def order(self, quantity=1, zone_id=None, event=None, tier=None, seat_ids=None):
        event = event or self.seated_event
        tier = tier or self.seated_tier
        return super().order(quantity=quantity, zone_id=zone_id, event=event,
                              tier=tier, seat_ids=seat_ids)

    def zones(self, event=None):
        return super().zones(event or self.seated_event)


class SeatBookingTests(SeatTestCase):
    """Booking specific seats, rather than a bare quantity, on a seated table."""

    def test_booking_two_of_three_seats_succeeds(self):
        resp = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1", "st1-s3"])
        self.assertEqual(resp.status_code, 201, resp.data)

        order = Order.objects.get(pk=resp.data["id"])
        allocation = ZoneAllocation.objects.get(order=order)
        self.assertEqual(len(allocation.seat_ids), 2)
        self.assertEqual(
            {s["id"] for s in allocation.seat_ids}, {"st1-s1", "st1-s3"})
        self.assertEqual(allocation.seat_ids[0]["label"], "Seat 1")
        self.assertEqual(allocation.seat_ids[1]["label"], "Seat 3")
        self.assertEqual(allocation.seat_ids[1]["furniture"], "sofa")

        table = self.zone("st1")
        self.assertEqual(table["available"], 1)
        seat_by_id = {s["id"]: s for s in table["seats"]}
        self.assertTrue(seat_by_id["st1-s1"]["taken"])
        self.assertFalse(seat_by_id["st1-s2"]["taken"])
        self.assertTrue(seat_by_id["st1-s3"]["taken"])

    def test_booking_an_already_taken_seat_is_refused_and_rolls_back(self):
        first = self.order(quantity=1, zone_id="st1", seat_ids=["st1-s1"])
        self.assertEqual(first.status_code, 201, first.data)

        before_orders = Order.objects.filter(user=self.buyer).count()
        before_reserved = TicketTier.objects.get(pk=self.seated_tier.pk).reserved_quantity

        second = self.order(quantity=1, zone_id="st1", seat_ids=["st1-s1"])
        self.assertEqual(second.status_code, 400)
        self.assertIn("just been taken", str(second.data["detail"]))

        # No stray order, no stray allocation, and the tier reservation the
        # rejected attempt made was rolled back — same guarantee whole-zone
        # booking already gets from ZoneUnavailable.
        self.assertEqual(Order.objects.filter(user=self.buyer).count(), before_orders)
        self.assertEqual(
            TicketTier.objects.get(pk=self.seated_tier.pk).reserved_quantity, before_reserved)
        self.assertEqual(ZoneAllocation.objects.filter(order__user=self.buyer).count(), 1)

    def test_booking_a_seat_already_held_by_another_live_order_is_refused(self):
        other_buyer = get_user_model().objects.create_user(
            email="zone-buyer-2@naada.test", full_name="Priya Iyer", phone="+919000000092")
        other_client = APIClient()
        other_client.force_authenticate(user=other_buyer)
        body = {"event_id": str(self.seated_event.id),
                "items": [{"tier_id": str(self.seated_tier.id), "quantity": 1}],
                "zone_id": "st1", "seat_ids": ["st1-s2"]}
        held = other_client.post(reverse("orders-create"), body, format="json")
        self.assertEqual(held.status_code, 201, held.data)

        mine = self.order(quantity=1, zone_id="st1", seat_ids=["st1-s2"])
        self.assertEqual(mine.status_code, 400)

    def test_wrong_seat_count_is_refused(self):
        too_few = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1"])
        self.assertEqual(too_few.status_code, 400)
        self.assertIn("1 seats for 2 tickets", str(too_few.data["detail"]))

        too_many = self.order(quantity=1, zone_id="st1", seat_ids=["st1-s1", "st1-s2"])
        self.assertEqual(too_many.status_code, 400)
        self.assertIn("2 seats for 1 tickets", str(too_many.data["detail"]))

        none_picked = self.order(quantity=1, zone_id="st1")
        self.assertEqual(none_picked.status_code, 400)
        self.assertIn("Pick a seat for each ticket", str(none_picked.data["detail"]))

    def test_an_unseated_table_and_a_vip_zone_still_book_by_quantity_alone(self):
        """Regression check: no seat_ids sent, behaviour is unchanged."""
        table = self.order(quantity=3, zone_id="t2")
        self.assertEqual(table.status_code, 201, table.data)
        self.assertEqual(self.zone("t2")["available"], 1)
        self.assertEqual(self.zone("t2")["seats"], [])

        vip = self.order(quantity=2, zone_id="v1")
        self.assertEqual(vip.status_code, 201, vip.data)
        self.assertEqual(self.zone("v1")["available"], 18)
        self.assertEqual(self.zone("v1")["seats"], [])

    def test_seats_list_becomes_the_effective_capacity(self):
        table = self.zone("st1")
        self.assertEqual(table["capacity"], 3)
        self.assertEqual(table["available"], 3)
        self.assertEqual(len(table["seats"]), 3)
        self.assertEqual([s["label"] for s in table["seats"]], ["Seat 1", "Seat 2", "Seat 3"])


class SeatTicketLabelTests(SeatTestCase):
    """The seat a buyer picked has to reach the ticket, distinctly per seat."""

    def test_confirmed_tickets_carry_their_own_seat_label(self):
        from apps.payments.views import _confirm_order

        resp = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1", "st1-s2"])
        order = Order.objects.get(pk=resp.data["id"])

        _confirm_order(order)

        labels = sorted(order.tickets.values_list("seat_label", flat=True))
        self.assertEqual(labels, ["Table A · Seat 1", "Table A · Seat 2"])
        self.assertNotEqual(labels[0], labels[1])

    def test_whole_zone_booking_keeps_the_shared_label(self):
        """Regression check: a zone without seats still stamps the plain
        zone label on every ticket, unchanged."""
        from apps.payments.views import _confirm_order

        resp = self.order(quantity=2, zone_id="v1")
        order = Order.objects.get(pk=resp.data["id"])

        _confirm_order(order)

        labels = list(order.tickets.values_list("seat_label", flat=True))
        self.assertEqual(labels, ["VIP Section", "VIP Section"])


class SeatReleaseTests(SeatTestCase):
    """An abandoned checkout must free its exact seats, not just a headcount."""

    def test_releasing_an_expired_order_frees_its_specific_seats(self):
        resp = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1", "st1-s3"])
        order = Order.objects.get(pk=resp.data["id"])

        order.expires_at = timezone.now() - timedelta(minutes=1)
        order.save(update_fields=["expires_at"])

        self.assertEqual(release_expired_orders(), 1)

        table = self.zone("st1")
        seat_by_id = {s["id"]: s for s in table["seats"]}
        self.assertFalse(seat_by_id["st1-s1"]["taken"])
        self.assertFalse(seat_by_id["st1-s3"]["taken"])
        self.assertEqual(table["available"], 3)

        # And those seats can be sold again.
        again = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1", "st1-s3"])
        self.assertEqual(again.status_code, 201, again.data)


# ─────────────────────────────────────────────────────────────────────────────
# Ticket cancellation and refund
#
# The buyer-facing "Cancel" button used to flip local React state and nothing
# else — no refund, no freed inventory, reverted on the next page load. These
# cover the real thing: a refund through the same payment machinery
# `initiate_refund` uses, a tier count that actually drops, a floor-plan seat
# that actually frees, and the 24-hour cutoff the confirmation dialog already
# promises the buyer.
# ─────────────────────────────────────────────────────────────────────────────

from apps.payments.models import Payment, PaymentStatus, Gateway, Refund


class TicketCancellationTests(ZoneTestCase):
    def confirm_and_pay(self, order):
        from apps.payments.views import _confirm_order
        _confirm_order(order)
        Payment.objects.create(
            order=order, gateway=Gateway.CASH, amount=order.total_amount,
            status=PaymentStatus.SUCCESS, completed_at=timezone.now())

    def cancel(self, ticket, reason=None):
        body = {"reason": reason} if reason else {}
        return self.client.post(reverse("tickets-cancel", args=[ticket.id]), body, format="json")

    def test_cancelling_a_paid_ticket_refunds_the_tier_price_and_frees_inventory(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()
        before_sold = TicketTier.objects.get(pk=self.tier.pk).sold_quantity

        cancel_resp = self.cancel(ticket, "Can't make it anymore")
        self.assertEqual(cancel_resp.status_code, 200, cancel_resp.data)
        self.assertEqual(cancel_resp.data["status"], "cancelled")

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CANCELLED)
        self.assertIsNotNone(ticket.cancelled_at)
        self.assertEqual(ticket.cancellation_reason, "Can't make it anymore")

        self.assertEqual(TicketTier.objects.get(pk=self.tier.pk).sold_quantity, before_sold - 1)

        refund = Refund.objects.get(ticket=ticket)
        self.assertEqual(refund.amount, self.tier.price)
        self.assertEqual(refund.status, Refund.Status.SUCCESS)
        self.assertEqual(refund.reason, Refund.Reason.USER_REQUEST)

    def test_cancelling_within_24_hours_of_the_event_forfeits_the_refund(self):
        near_event = self.make_event(self.venue, "Tonight Only")
        near_event.start_datetime = timezone.now() + timedelta(hours=5)
        near_event.save(update_fields=["start_datetime"])
        near_tier = self.make_tier(near_event)

        resp = self.order(quantity=1, event=near_event, tier=near_tier)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        cancel_resp = self.cancel(ticket)
        self.assertEqual(cancel_resp.status_code, 200, cancel_resp.data)

        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CANCELLED)

        refund = Refund.objects.get(ticket=ticket)
        self.assertEqual(refund.amount, Decimal("0"))
        self.assertEqual(refund.status, Refund.Status.SUCCESS)

    def test_cancelling_a_free_ticket_needs_no_payment_at_all(self):
        free_tier = TicketTier.objects.create(
            event=self.event, name="Free", price=Decimal("0"), total_quantity=50)
        resp = self.order(quantity=1, tier=free_tier)
        order = Order.objects.get(pk=resp.data["id"])
        from apps.payments.views import _confirm_order
        _confirm_order(order)  # deliberately no Payment row — mirrors a real free RSVP
        ticket = order.tickets.first()

        cancel_resp = self.cancel(ticket)
        self.assertEqual(cancel_resp.status_code, 200, cancel_resp.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CANCELLED)
        self.assertFalse(Refund.objects.filter(ticket=ticket).exists())

    def test_cancelling_someone_elses_ticket_404s(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        intruder = get_user_model().objects.create_user(
            email="cancel-intruder@naada.test", full_name="Nosy Neighbour")
        intruder_client = APIClient()
        intruder_client.force_authenticate(user=intruder)
        resp2 = intruder_client.post(reverse("tickets-cancel", args=[ticket.id]))
        self.assertEqual(resp2.status_code, 404)

    def test_cancelling_twice_is_refused_the_second_time(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        self.assertEqual(self.cancel(ticket).status_code, 200)
        second = self.cancel(ticket)
        self.assertEqual(second.status_code, 400)
        # And no second refund was created for it.
        self.assertEqual(Refund.objects.filter(ticket=ticket).count(), 1)

    def test_a_checked_in_ticket_cannot_be_cancelled(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()
        ticket.status = Ticket.Status.USED
        ticket.save(update_fields=["status"])

        resp2 = self.cancel(ticket)
        self.assertEqual(resp2.status_code, 400)

    def test_cancelling_the_only_ticket_fully_cancels_the_order(self):
        resp = self.order(quantity=1)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        self.cancel(ticket)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.FULLY_CANCELLED)
        self.assertIsNotNone(order.cancelled_at)

    def test_cancelling_one_of_several_partially_cancels_the_order(self):
        resp = self.order(quantity=3)
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        self.cancel(ticket)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PARTIALLY_CANCELLED)

    def test_cancelling_a_whole_zone_ticket_frees_exactly_one_place(self):
        resp = self.order(quantity=2, zone_id="v1")
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        before = self.zone("v1")["available"]
        self.cancel(ticket)
        after = self.zone("v1")["available"]
        self.assertEqual(after, before + 1)


class SeatTicketCancellationTests(SeatTestCase):
    """Cancelling one seated ticket must free only that seat."""

    def confirm_and_pay(self, order):
        from apps.payments.views import _confirm_order
        _confirm_order(order)
        Payment.objects.create(
            order=order, gateway=Gateway.CASH, amount=order.total_amount,
            status=PaymentStatus.SUCCESS, completed_at=timezone.now())

    def test_cancelling_one_seated_ticket_frees_only_that_seat(self):
        resp = self.order(quantity=2, zone_id="st1", seat_ids=["st1-s1", "st1-s3"])
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)

        ticket_s1 = order.tickets.get(seat_label="Table A · Seat 1")
        cancel_resp = self.client.post(reverse("tickets-cancel", args=[ticket_s1.id]))
        self.assertEqual(cancel_resp.status_code, 200, cancel_resp.data)

        table = self.zone("st1")
        seat_by_id = {s["id"]: s for s in table["seats"]}
        self.assertFalse(seat_by_id["st1-s1"]["taken"])
        self.assertTrue(seat_by_id["st1-s3"]["taken"])

        allocation = ZoneAllocation.objects.get(order=order)
        self.assertEqual(len(allocation.seat_ids), 1)
        self.assertEqual(allocation.quantity, 1)
        self.assertEqual(allocation.status, ZoneAllocation.Status.HELD)

    def test_cancelling_the_last_seated_ticket_releases_the_whole_allocation(self):
        resp = self.order(quantity=1, zone_id="st1", seat_ids=["st1-s1"])
        order = Order.objects.get(pk=resp.data["id"])
        self.confirm_and_pay(order)
        ticket = order.tickets.first()

        self.client.post(reverse("tickets-cancel", args=[ticket.id]))

        allocation = ZoneAllocation.objects.get(order=order)
        self.assertEqual(allocation.status, ZoneAllocation.Status.RELEASED)


# ─────────────────────────────────────────────────────────────────────────────
# Ticket transfer
#
# The model (`TicketTransfer`, `Ticket.transfer_count`) already existed but was
# never wired to anything. The door only cares about `status`, never who holds
# a ticket, so reassigning the same row is enough — a new ticket number or QR
# would be pointless churn.
# ─────────────────────────────────────────────────────────────────────────────

class TicketTransferTests(ZoneTestCase):
    def setUp(self):
        super().setUp()
        self.recipient = get_user_model().objects.create_user(
            email="recipient@naada.test", full_name="Recipient Person", phone="+919000000099")

    def issue_ticket(self, quantity=1):
        resp = self.order(quantity=quantity)
        order = Order.objects.get(pk=resp.data["id"])
        from apps.payments.views import _confirm_order
        _confirm_order(order)
        return order.tickets.first()

    def transfer(self, ticket, email, client=None):
        return (client or self.client).post(
            reverse("tickets-transfer", args=[ticket.id]),
            {"recipient_email": email}, format="json")

    def test_transferring_to_an_existing_account_reassigns_the_ticket(self):
        ticket = self.issue_ticket()
        resp = self.transfer(ticket, "recipient@naada.test")
        self.assertEqual(resp.status_code, 200, resp.data)

        ticket.refresh_from_db()
        self.assertEqual(ticket.user_id, self.recipient.id)
        self.assertEqual(ticket.holder_email, "recipient@naada.test")
        self.assertEqual(ticket.holder_name, self.recipient.name)
        self.assertEqual(ticket.transfer_count, 1)
        self.assertEqual(ticket.original_purchaser_id, self.buyer.id)
        self.assertEqual(ticket.status, Ticket.Status.VALID)

        from apps.tickets.models import TicketTransfer
        record = TicketTransfer.objects.get(ticket=ticket)
        self.assertEqual(record.from_user_id, self.buyer.id)
        self.assertEqual(record.to_user_id, self.recipient.id)

    def test_transferred_ticket_moves_between_my_tickets_lists(self):
        ticket = self.issue_ticket()
        self.transfer(ticket, "recipient@naada.test")

        mine = self.client.get(reverse("tickets-mine"))
        self.assertEqual(mine.data["count"], 0)

        recipient_client = APIClient()
        recipient_client.force_authenticate(user=self.recipient)
        theirs = recipient_client.get(reverse("tickets-mine"))
        self.assertEqual(theirs.data["count"], 1)

    def test_transferring_to_a_nonexistent_email_is_refused(self):
        ticket = self.issue_ticket()
        resp = self.transfer(ticket, "nobody-here@naada.test")
        self.assertEqual(resp.status_code, 404)

    def test_transferring_to_yourself_is_refused(self):
        ticket = self.issue_ticket()
        resp = self.transfer(ticket, self.buyer.email)
        self.assertEqual(resp.status_code, 400)

    def test_a_used_ticket_cannot_be_transferred(self):
        ticket = self.issue_ticket()
        ticket.status = Ticket.Status.USED
        ticket.save(update_fields=["status"])
        resp = self.transfer(ticket, "recipient@naada.test")
        self.assertEqual(resp.status_code, 400)

    def test_a_cancelled_ticket_cannot_be_transferred(self):
        ticket = self.issue_ticket()
        ticket.status = Ticket.Status.CANCELLED
        ticket.save(update_fields=["status"])
        resp = self.transfer(ticket, "recipient@naada.test")
        self.assertEqual(resp.status_code, 400)

    def test_a_transferred_ticket_can_be_transferred_again_by_its_new_holder(self):
        ticket = self.issue_ticket()
        self.transfer(ticket, "recipient@naada.test")

        third = get_user_model().objects.create_user(
            email="third-person@naada.test", full_name="Third Person")
        recipient_client = APIClient()
        recipient_client.force_authenticate(user=self.recipient)
        resp = self.transfer(ticket, "third-person@naada.test", client=recipient_client)
        self.assertEqual(resp.status_code, 200, resp.data)

        ticket.refresh_from_db()
        self.assertEqual(ticket.transfer_count, 2)
        self.assertEqual(ticket.user_id, third.id)
        self.assertEqual(ticket.original_purchaser_id, self.buyer.id)

    def test_the_senders_old_qr_stops_working_and_the_new_holders_works(self):
        ticket = self.issue_ticket()
        old_qr = ticket.qr_data
        self.transfer(ticket, "recipient@naada.test")
        ticket.refresh_from_db()
        self.assertNotEqual(ticket.qr_data, old_qr)

        door = APIClient()
        door.force_authenticate(user=self.host)
        self.assertEqual(door.post(reverse("tickets-scan", args=[old_qr])).status_code, 404)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.VALID)
        self.assertEqual(door.post(reverse("tickets-scan", args=[ticket.qr_data])).status_code, 200)

    def test_the_new_holder_is_told_in_app_and_by_email(self):
        from django.core import mail
        from apps.notifications.models import Notification, NotificationType
        ticket = self.issue_ticket()
        mail.outbox.clear()
        self.transfer(ticket, "recipient@naada.test")

        notice = Notification.objects.get(
            user=self.recipient, notification_type=NotificationType.TICKET_TRANSFER_RECEIVED)
        self.assertIn("Anita Shetty", notice.title)
        self.assertEqual(notice.action_url, f"/tickets/{ticket.id}")
        sent = [m for m in mail.outbox if m.to == ["recipient@naada.test"]]
        self.assertEqual(len(sent), 1)
        self.assertIn(ticket.ticket_number, sent[0].body)
        # The sender is not emailed about their own action.
        self.assertFalse([m for m in mail.outbox if m.to == [self.buyer.email]])

    def test_a_failed_notice_does_not_undo_the_transfer(self):
        from unittest import mock
        ticket = self.issue_ticket()
        with mock.patch("apps.notifications.dispatch.ticket_received", side_effect=RuntimeError("boom")):
            resp = self.transfer(ticket, "recipient@naada.test")
        self.assertEqual(resp.status_code, 200)
        ticket.refresh_from_db()
        self.assertEqual(ticket.user_id, self.recipient.id)

    def test_a_ticket_to_a_finished_or_cancelled_event_cannot_be_transferred(self):
        ticket = self.issue_ticket()
        Event.objects.filter(pk=self.event.pk).update(
            start_datetime=timezone.now() - timedelta(hours=5),
            end_datetime=timezone.now() - timedelta(hours=2))
        self.assertEqual(self.transfer(ticket, "recipient@naada.test").status_code, 400)

        Event.objects.filter(pk=self.event.pk).update(
            end_datetime=timezone.now() + timedelta(hours=2), status=EventStatus.CANCELLED)
        self.assertEqual(self.transfer(ticket, "recipient@naada.test").status_code, 400)
        ticket.refresh_from_db()
        self.assertEqual(ticket.user_id, self.buyer.id)

    def test_original_sender_can_no_longer_act_on_a_transferred_ticket(self):
        ticket = self.issue_ticket()
        self.transfer(ticket, "recipient@naada.test")

        resp = self.client.post(reverse("tickets-cancel", args=[ticket.id]))
        self.assertEqual(resp.status_code, 404)


class DoorAccessTests(ZoneTestCase):
    """Who is allowed to work the door, and what they can see there.

    Check-in used to require nothing but a signed-in account. A ticket's
    `qr_data` is printed on the QR and people screenshot their tickets and
    forward them, so anyone who received one of those images could mark it
    used before its holder reached the door — and the holder would arrive to
    "Ticket is used" with no recourse.
    """

    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.stranger = User.objects.create_user(
            email="stranger@naada.test", full_name="Passing Stranger")
        self.other_host = User.objects.create_user(
            email="other-host@naada.test", full_name="Other Host")
        self.ops = User.objects.create_user(
            email="door-ops@naada.test", full_name="Ops", is_staff=True)

        resp = self.order(quantity=1, zone_id=None, event=self.bare_event, tier=self.bare_tier)
        self.assertEqual(resp.status_code, 201, resp.data)
        self.order_row = Order.objects.get(pk=resp.data["id"])
        self.issue_tickets(self.order_row)
        self.ticket = self.order_row.tickets.first()

    def as_(self, user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    def scan_url(self):
        return reverse("tickets-scan", args=[self.ticket.qr_data])

    def door_url(self, event=None):
        return reverse("event-attendees", args=[(event or self.bare_event).id])

    # ── check-in ─────────────────────────────────────────────────────────────

    def test_the_organiser_can_check_a_ticket_in(self):
        resp = self.as_(self.host).post(self.scan_url())
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertTrue(resp.data["valid"])
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.USED)

    def test_a_stranger_with_the_qr_cannot_burn_someone_elses_ticket(self):
        resp = self.as_(self.stranger).post(self.scan_url())
        self.assertEqual(resp.status_code, 403, resp.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.VALID)

    def test_the_ticket_holder_cannot_check_themselves_in(self):
        # Otherwise a buyer could mark their own ticket used from the sofa,
        # then turn up and claim the door made a mistake.
        resp = self.as_(self.buyer).post(self.scan_url())
        self.assertEqual(resp.status_code, 403, resp.data)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.VALID)

    def test_a_different_host_cannot_work_someone_elses_door(self):
        resp = self.as_(self.other_host).post(self.scan_url())
        self.assertEqual(resp.status_code, 403, resp.data)

    def test_staff_can_step_in(self):
        resp = self.as_(self.ops).post(self.scan_url())
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_signed_out_is_still_refused(self):
        self.assertIn(APIClient().post(self.scan_url()).status_code, (401, 403))

    # ── the door list ────────────────────────────────────────────────────────

    def test_the_organiser_gets_their_door_list(self):
        resp = self.as_(self.host).get(self.door_url())
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["count"], 1)
        row = resp.data["results"][0]
        self.assertEqual(row["ticket_number"], self.ticket.ticket_number)
        self.assertEqual(row["status"], Ticket.Status.VALID)

    def test_the_door_list_carries_what_the_manual_lookup_needs(self):
        row = self.as_(self.host).get(self.door_url()).data["results"][0]
        for field in ("holder_name", "ticket_number", "qr_data", "tier_name", "status"):
            self.assertIn(field, row)

    def test_the_door_list_does_not_leak_contact_details(self):
        # Door staff need to find a person and admit them, not read a buyer's
        # email and phone number off a shared tablet.
        row = self.as_(self.host).get(self.door_url()).data["results"][0]
        self.assertNotIn("holder_email", row)
        self.assertNotIn("holder_phone", row)

    def test_a_stranger_cannot_read_the_door_list(self):
        self.assertEqual(self.as_(self.stranger).get(self.door_url()).status_code, 403)

    def test_another_host_cannot_read_it_either(self):
        self.assertEqual(self.as_(self.other_host).get(self.door_url()).status_code, 403)

    def test_cancelled_tickets_are_not_on_the_door_list(self):
        # A refunded ticket must not be admittable from the manual list.
        self.ticket.status = Ticket.Status.CANCELLED
        self.ticket.save(update_fields=["status"])
        self.assertEqual(self.as_(self.host).get(self.door_url()).data["count"], 0)

    def test_a_checked_in_ticket_still_shows_as_already_in(self):
        # So the door can tell "not on the list" apart from "already came in".
        self.as_(self.host).post(self.scan_url())
        row = self.as_(self.host).get(self.door_url()).data["results"][0]
        self.assertEqual(row["status"], Ticket.Status.USED)
        self.assertIsNotNone(row["checked_in_at"])

    def test_scanning_an_already_used_ticket_is_refused(self):
        first = self.as_(self.host).post(self.scan_url())
        self.assertEqual(first.status_code, 200, first.data)
        self.assertTrue(first.data["valid"])

        second = self.as_(self.host).post(self.scan_url())
        self.assertEqual(second.status_code, 400, second.data)
        self.assertFalse(second.data["valid"])


class FacilitiesAndBabyChairTests(ZoneTestCase):
    """Restrooms and speakers describe the room; baby chairs are a free,
    stock-limited add-on at a table."""

    def setUp(self):
        super().setUp()
        self.venue.layout = {"version": 1, "elements": [
            {"id": "r1", "type": "restroom", "x": 2, "y": 2, "w": 8, "h": 8,
             "label": "Restrooms", "capacity": 0, "count": 4},
            {"id": "sp1", "type": "speaker", "x": 20, "y": 2, "w": 4, "h": 4,
             "label": "Speaker", "capacity": 50},
            {"id": "t1", "type": "table", "x": 7, "y": 30, "w": 10, "h": 10,
             "label": "Table A", "capacity": 4, "babyChairs": 2,
             "seats": [{"id": f"a{i}", "t": i / 4, "furniture": "chair", "groupId": None}
                       for i in range(4)]},
        ]}
        self.venue.save(update_fields=["layout"])

    def test_restrooms_and_speakers_are_never_bookable(self):
        self.assertFalse(self.zone("r1")["bookable"])
        self.assertEqual(self.zone("r1")["count"], 4)
        # Even with a typed-in capacity, a speaker is not something to sell.
        self.assertFalse(self.zone("sp1")["bookable"])

    def test_table_reports_baby_chair_stock(self):
        z = self.zone("t1")
        self.assertEqual(z["baby_chairs_total"], 2)
        self.assertEqual(z["baby_chairs_available"], 2)

    def _order_with_baby(self, n, seat="a0"):
        body = {"event_id": str(self.event.id),
                "items": [{"tier_id": str(self.tier.id), "quantity": 1}],
                "zone_id": "t1", "seat_ids": [seat], "baby_chairs": n}
        return self.client.post(reverse("orders-create"), body, format="json")

    def test_baby_chairs_are_held_and_cannot_be_oversold(self):
        resp = self._order_with_baby(1, "a0")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(resp.data["zone"]["baby_chairs"], 1)
        self.assertEqual(self.zone("t1")["baby_chairs_available"], 1)

        resp = self._order_with_baby(2, "a1")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Only 1 baby chair left", str(resp.data["detail"]))

    def test_baby_chairs_do_not_count_as_tickets_or_seats(self):
        resp = self._order_with_baby(2, "a0")
        self.assertEqual(resp.status_code, 201, resp.data)
        self.assertEqual(self.zone("t1")["available"], 3)
