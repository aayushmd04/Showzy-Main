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
