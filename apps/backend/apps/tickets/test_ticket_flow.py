"""The whole ticket journey, front to back, and the doors around it.

One host puts a night on sale, a stranger buys a ticket, the host can see the
booking, a gatekeeper they invited admits the guest — and at each step the
people who should *not* be able to do that cannot.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone

from apps.events.models import Event, EventStatus
from apps.payments.gateways import reset_gateway_cache
from apps.payments.models import Payment, PaymentStatus, Refund
from apps.tickets.models import GateAssignment, Order, Ticket, TicketTier
from apps.tickets.test_gate import GateBase

MOCK = dict(
    PAYMENT_GATEWAY="mock",
    MOCK_PAYMENT_KEY_ID="rzp_test_mocknaada001",
    MOCK_PAYMENT_KEY_SECRET="naada_mock_secret_dev_only",
    MOCK_PAYMENT_OUTCOME="",
)


@override_settings(**MOCK)
class TicketFlowBase(GateBase):
    def setUp(self):
        reset_gateway_cache()
        super().setUp()
        U = get_user_model()
        self.host.role = "venue_owner"
        self.host.save(update_fields=["role"])
        self.other_host.role = "venue_owner"
        self.other_host.save(update_fields=["role"])
        self.fan = U.objects.create_user(email="fan@naada.test", full_name="Fan", phone="+919000000009")

    def order(self, user, event, tier, qty=1):
        return self.as_user(user).post(reverse("orders-create"), {
            "event_id": str(event.id), "items": [{"tier_id": str(tier.id), "quantity": qty}],
        }, format="json")

    def pay(self, user, order_id):
        c = self.as_user(user)
        init = c.post(reverse("payments-initiate"), {"order_id": order_id, "gateway": "razorpay"}, format="json")
        self.assertEqual(init.status_code, 200, init.data)
        checkout = c.post(reverse("payments-mock-checkout"), {
            "order_id": order_id, "gateway_order_id": init.data["gateway_order_id"]}, format="json").data
        verified = c.post(reverse("payments-verify"), {
            "order_id": order_id,
            "gateway_order_id": checkout["gateway_order_id"],
            "gateway_payment_id": checkout["gateway_payment_id"],
            "gateway_signature": checkout["gateway_signature"],
        }, format="json")
        self.assertEqual(verified.status_code, 200, verified.data)
        return init.data

    def sellable(self, event=None, price="250.00", total=20):
        return TicketTier.objects.create(
            event=event or self.event, name="Floor", price=Decimal(price), total_quantity=total)


class BuyToDoorJourneyTests(TicketFlowBase):
    def test_host_publishes_a_buyer_books_the_host_sees_it_and_a_gatekeeper_admits_them(self):
        host = self.as_user(self.host)

        # The host creates a night. It starts as a draft, whatever they ask for.
        r = host.post(reverse("events-create"), {
            "title": "Friday Raga", "venue": str(self.venue.id),
            "start_datetime": (timezone.now() + timedelta(hours=1)).isoformat(),
            "end_datetime": (timezone.now() + timedelta(hours=4)).isoformat(),
        }, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        event_id = r.data["id"]
        self.assertEqual(Event.objects.get(pk=event_id).status, EventStatus.DRAFT)

        # Nothing to sell yet: can't publish, and a stranger can't see or buy it.
        self.assertEqual(host.post(reverse("events-publish", args=[event_id])).status_code, 400)
        self.assertEqual(self.as_user(self.fan).get(reverse("events-detail", args=[event_id])).status_code, 404)

        t = host.post(reverse("event-tiers", args=[event_id]), {
            "name": "General", "price": "250.00", "total_quantity": 30}, format="json")
        self.assertEqual(t.status_code, 201, t.data)
        self.assertEqual(self.order(self.fan, Event.objects.get(pk=event_id),
                                    TicketTier.objects.get(pk=t.data["id"])).status_code, 400)

        self.assertEqual(host.post(reverse("events-publish", args=[event_id])).status_code, 200)
        self.assertEqual(self.as_user(self.fan).get(reverse("events-detail", args=[event_id])).status_code, 200)

        # A fan books and pays.
        event, tier = Event.objects.get(pk=event_id), TicketTier.objects.get(pk=t.data["id"])
        placed = self.order(self.fan, event, tier, qty=2)
        self.assertEqual(placed.status_code, 201, placed.data)
        self.pay(self.fan, placed.data["id"])
        mine = self.as_user(self.fan).get(reverse("tickets-mine")).data
        self.assertEqual(mine["count"], 2)

        # The host sees both bookings on the door list — names, tier, no contact details.
        att = host.get(reverse("event-attendees", args=[event_id]))
        self.assertEqual(att.status_code, 200)
        self.assertEqual(att.data["count"], 2)
        self.assertNotIn("holder_email", att.data["results"][0])
        self.assertEqual(host.get(reverse("event-payout-summary", args=[event_id])).status_code, 200)

        # A gatekeeper the host invited admits one of them.
        self.assertEqual(host.post(reverse("gate-invite", args=[event_id]),
                                   {"email": "gate@naada.test"}, format="json").status_code, 201)
        gk = self.as_user(self.gk)
        pending = gk.get(reverse("gate-mine")).data
        self.assertEqual(len(pending["invitations"]), 1)
        self.assertEqual(gk.post(reverse("gate-accept", args=[pending["invitations"][0]["id"]])).status_code, 200)

        ticket = Ticket.objects.filter(event=event).first()
        scan = gk.post(reverse("tickets-scan", args=[ticket.qr_data]))
        self.assertEqual(scan.status_code, 200, scan.data)
        self.assertTrue(scan.data["valid"])
        self.assertNotIn("holder_email", scan.data["ticket"])
        # The same ticket does not get in twice.
        self.assertEqual(gk.post(reverse("tickets-scan", args=[ticket.qr_data])).status_code, 400)

        # The host's live gate board shows the scan.
        board = host.get(reverse("gate-overview", args=[event_id])).data
        self.assertEqual(board["totals"]["admitted"], 1)
        self.assertEqual(board["totals"]["tickets"], 2)

    def test_a_gatekeeper_cannot_read_the_events_money(self):
        self.make_active()
        r = self.as_user(self.gk).get(reverse("event-payout-summary", args=[self.event.id]))
        self.assertEqual(r.status_code, 403)

    def test_a_buyer_cannot_scan_their_own_ticket_or_read_the_door_list(self):
        self.assertEqual(self.scan(self.buyer, self.ticket).status_code, 403)
        r = self.as_user(self.buyer).get(reverse("event-attendees", args=[self.event.id]))
        self.assertEqual(r.status_code, 403)


class GateVisibilityTests(TicketFlowBase):
    """The app decides whether to show "Gate duty" from /gate/mine/."""

    def mine(self, user):
        return self.as_user(user).get(reverse("gate-mine")).data

    def test_a_plain_account_has_nothing(self):
        d = self.mine(self.stranger)
        self.assertEqual((d["invitations"], d["assignments"]), ([], []))

    def test_an_invite_for_someone_else_is_invisible_to_a_stranger(self):
        self.invite(email="gate@naada.test")
        d = self.mine(self.stranger)
        self.assertEqual((d["invitations"], d["assignments"]), ([], []))
        self.assertEqual(len(self.mine(self.gk)["invitations"]), 1)

    def test_access_ends_when_the_shift_is_over(self):
        old = self.make_event("Last month", hours_from_now=-24 * 30)
        self.make_active(event=old)
        self.assertEqual(self.mine(self.gk)["assignments"], [])

    def test_a_revoked_gatekeeper_loses_the_screen(self):
        a = self.make_active()
        self.assertEqual(len(self.mine(self.gk)["assignments"]), 1)
        self.as_user(self.host).delete(reverse("gate-revoke", args=[self.event.id, a.id]))
        self.assertEqual(self.mine(self.gk)["assignments"], [])
        self.assertEqual(GateAssignment.objects.get(pk=a.pk).status, GateAssignment.Status.REVOKED)


class BookingRuleTests(TicketFlowBase):
    def test_a_failed_second_tier_does_not_keep_the_first_tier_reserved(self):
        a = self.sellable(total=5)
        b = TicketTier.objects.create(event=self.event, name="VIP", price=Decimal("900"), total_quantity=1)
        r = self.as_user(self.fan).post(reverse("orders-create"), {
            "event_id": str(self.event.id),
            "items": [{"tier_id": str(a.id), "quantity": 2}, {"tier_id": str(b.id), "quantity": 3}],
        }, format="json")
        self.assertEqual(r.status_code, 400)
        a.refresh_from_db()
        self.assertEqual(a.reserved_quantity, 0)
        self.assertEqual(Order.objects.filter(user=self.fan).count(), 0)

    def test_a_sold_out_tier_says_so(self):
        tier = self.sellable(total=1)
        self.assertEqual(self.order(self.fan, self.event, tier).status_code, 201)
        r = self.order(self.stranger, self.event, tier)
        self.assertEqual(r.status_code, 400)
        self.assertIn("sold out", r.data["detail"].lower())

    def test_sales_window_and_per_order_limit_are_enforced(self):
        tier = self.sellable()
        tier.sale_start_datetime = timezone.now() + timedelta(hours=2)
        tier.save()
        self.assertEqual(self.order(self.fan, self.event, tier).status_code, 400)
        tier.sale_start_datetime = None
        tier.sale_end_datetime = timezone.now() - timedelta(minutes=1)
        tier.save()
        self.assertEqual(self.order(self.fan, self.event, tier).status_code, 400)
        tier.sale_end_datetime = None
        tier.max_per_order = 2
        tier.save()
        self.assertEqual(self.order(self.fan, self.event, tier, qty=3).status_code, 400)
        self.assertEqual(self.order(self.fan, self.event, tier, qty=2).status_code, 201)

    def test_a_declined_payment_does_not_lock_the_buyer_out_of_a_retry(self):
        tier = self.sellable(total=2)
        first = self.order(self.fan, self.event, tier, qty=2)
        self.assertEqual(first.status_code, 201)
        init = self.as_user(self.fan).post(reverse("payments-initiate"), {
            "order_id": first.data["id"], "gateway": "razorpay"}, format="json").data
        self.as_user(self.fan).post(reverse("payments-mock-checkout"), {
            "order_id": first.data["id"], "gateway_order_id": init["gateway_order_id"],
            "outcome": "failed"}, format="json")
        # Both tickets are still "held" by the declined attempt, yet a retry works.
        again = self.order(self.fan, self.event, tier, qty=2)
        self.assertEqual(again.status_code, 201, again.data)
        self.assertEqual(Order.objects.get(pk=first.data["id"]).status, Order.Status.EXPIRED)
        tier.refresh_from_db()
        self.assertEqual(tier.reserved_quantity, 2)

    def test_an_unpaid_order_is_not_released_just_because_the_buyer_ordered_again(self):
        tier = self.sellable(total=10)
        first = self.order(self.fan, self.event, tier, qty=2)
        self.order(self.fan, self.event, tier, qty=1)
        self.assertEqual(Order.objects.get(pk=first.data["id"]).status, Order.Status.INITIATED)


    def test_paying_on_an_order_whose_hold_has_lapsed_is_refused_and_frees_the_seats(self):
        tier = self.sellable(total=3)
        placed = self.order(self.fan, self.event, tier, qty=2)
        Order.objects.filter(pk=placed.data["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
        r = self.as_user(self.fan).post(reverse("payments-initiate"), {
            "order_id": placed.data["id"], "gateway": "razorpay"}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("released", r.data["detail"])
        tier.refresh_from_db()
        self.assertEqual(tier.reserved_quantity, 0)
        self.assertEqual(Order.objects.get(pk=placed.data["id"]).status, Order.Status.EXPIRED)

    def test_a_declined_payment_can_be_retried_on_the_same_order(self):
        tier = self.sellable(total=2)
        placed = self.order(self.fan, self.event, tier, qty=2)
        c = self.as_user(self.fan)
        first = c.post(reverse("payments-initiate"), {"order_id": placed.data["id"], "gateway": "razorpay"}, format="json").data
        c.post(reverse("payments-mock-checkout"), {
            "order_id": placed.data["id"], "gateway_order_id": first["gateway_order_id"],
            "outcome": "failed"}, format="json")
        self.pay(self.fan, placed.data["id"])
        self.assertEqual(Ticket.objects.filter(order_id=placed.data["id"]).count(), 2)


class RefundSafetyTests(TicketFlowBase):
    def paid_ticket(self):
        tier = self.sellable()
        placed = self.order(self.fan, self.event, tier, qty=1)
        init = self.pay(self.fan, placed.data["id"])
        return Ticket.objects.get(order_id=placed.data["id"]), init["payment_id"]

    def test_a_buyer_cannot_take_a_refund_and_keep_the_ticket(self):
        ticket, payment_id = self.paid_ticket()
        r = self.as_user(self.fan).post(reverse("payments-refund"), {
            "payment_id": payment_id, "reason": "user_request"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(Refund.objects.count(), 0)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.VALID)

    def test_an_organiser_refund_voids_the_ticket_and_frees_the_place(self):
        ticket, payment_id = self.paid_ticket()
        tier = ticket.tier
        sold_before = TicketTier.objects.get(pk=tier.pk).sold_quantity
        r = self.as_user(self.host).post(reverse("payments-refund"), {
            "payment_id": payment_id, "reason": "user_request", "ticket_id": str(ticket.id)}, format="json")
        self.assertEqual(r.status_code, 201, r.data)
        ticket.refresh_from_db()
        self.assertEqual(ticket.status, Ticket.Status.CANCELLED)
        self.assertEqual(TicketTier.objects.get(pk=tier.pk).sold_quantity, sold_before - 1)
        # …and the same ticket can't be refunded twice.
        again = self.as_user(self.host).post(reverse("payments-refund"), {
            "payment_id": payment_id, "reason": "user_request", "ticket_id": str(ticket.id)}, format="json")
        self.assertEqual(again.status_code, 400)

    def test_another_hosts_refund_is_refused(self):
        _, payment_id = self.paid_ticket()
        r = self.as_user(self.other_host).post(reverse("payments-refund"), {
            "payment_id": payment_id, "reason": "user_request"}, format="json")
        self.assertEqual(r.status_code, 404)
        self.assertEqual(Payment.objects.get(pk=payment_id).status, PaymentStatus.SUCCESS)


class EventAuthoringTests(TicketFlowBase):
    def create(self, user, **extra):
        body = {"title": "New night", "venue": str(self.venue.id),
                "start_datetime": (timezone.now() + timedelta(days=3)).isoformat(),
                "end_datetime": (timezone.now() + timedelta(days=3, hours=3)).isoformat(), **extra}
        return self.as_user(user).post(reverse("events-create"), body, format="json")

    def test_only_a_venue_account_creates_events(self):
        self.assertEqual(self.create(self.fan).status_code, 403)

    def test_a_host_cannot_create_an_event_at_someone_elses_venue(self):
        self.assertEqual(self.create(self.other_host).status_code, 403)

    def test_a_new_event_cannot_be_born_published(self):
        self.assertEqual(self.create(self.host, status="published").status_code, 400)

    def test_a_patch_cannot_skip_the_publish_step(self):
        r = self.create(self.host)
        p = self.as_user(self.host).patch(reverse("events-detail", args=[r.data["id"]]),
                                          {"status": "published"}, format="json")
        self.assertEqual(p.status_code, 400)


class TierManagementTests(TicketFlowBase):
    def url(self, tier=None):
        return reverse("event-tier-detail", args=[self.event.id, tier.id]) if tier \
            else reverse("event-tiers", args=[self.event.id])

    def test_only_the_organiser_manages_tiers(self):
        body = {"name": "X", "price": "10", "total_quantity": 5}
        for who in (self.fan, self.other_host, self.gk):
            self.assertEqual(self.as_user(who).post(self.url(), body, format="json").status_code, 403)
        self.assertEqual(self.as_user(self.host).post(self.url(), body, format="json").status_code, 201)

    def test_bad_values_are_refused(self):
        h = self.as_user(self.host)
        for body in ({"name": "", "price": "10", "total_quantity": 5},
                     {"name": "X", "price": "-1", "total_quantity": 5},
                     {"name": "X", "price": "10", "total_quantity": 0}):
            self.assertEqual(h.post(self.url(), body, format="json").status_code, 400, body)

    def test_cannot_put_more_on_sale_than_the_room_holds(self):
        self.venue.capacity = 100
        self.venue.save()
        h = self.as_user(self.host)
        # GateBase already put a 50-ticket tier on this event.
        ok = h.post(self.url(), {"name": "A", "price": "10", "total_quantity": 50}, format="json")
        self.assertEqual(ok.status_code, 201, ok.data)
        over = h.post(self.url(), {"name": "B", "price": "10", "total_quantity": 1}, format="json")
        self.assertEqual(over.status_code, 400)
        self.assertIn("room holds 100", str(over.data))
        # Raising an existing tier past the room is refused too.
        a = TicketTier.objects.get(pk=ok.data["id"])
        self.assertEqual(h.patch(self.url(a), {"total_quantity": 60}, format="json").status_code, 400)
        # A paused tier doesn't count against the room.
        h.patch(self.url(a), {"is_active": False}, format="json")
        self.assertEqual(h.post(self.url(), {"name": "C", "price": "10", "total_quantity": 50}, format="json").status_code, 201)

    def test_cannot_shrink_below_what_is_sold_or_change_the_price_of_a_sold_tier(self):
        tier = self.sellable(total=10)
        self.pay(self.fan, self.order(self.fan, self.event, tier, qty=3).data["id"])
        h = self.as_user(self.host)
        self.assertEqual(h.patch(self.url(tier), {"total_quantity": 2}, format="json").status_code, 400)
        self.assertEqual(h.patch(self.url(tier), {"price": "1.00"}, format="json").status_code, 400)
        self.assertEqual(h.patch(self.url(tier), {"total_quantity": 3}, format="json").status_code, 200)

    def test_delete_removes_an_untouched_tier_and_only_switches_off_one_with_history(self):
        fresh = self.sellable()
        r = self.as_user(self.host).delete(self.url(fresh))
        self.assertEqual(r.status_code, 204)
        self.assertFalse(TicketTier.objects.filter(pk=fresh.pk).exists())

        used = self.sellable()
        self.order(self.fan, self.event, used)
        r = self.as_user(self.host).delete(self.url(used))
        self.assertEqual(r.status_code, 200)
        used.refresh_from_db()
        self.assertFalse(used.is_active)

    def test_public_event_hides_switched_off_tiers_but_the_organiser_still_sees_them(self):
        live = self.sellable()
        off = TicketTier.objects.create(event=self.event, name="Hidden", price=Decimal("1"),
                                        total_quantity=5, is_active=False)
        url = reverse("events-detail", args=[self.event.id])
        public = {t["name"] for t in self.as_user(self.fan).get(url).data["ticket_tiers"]}
        self.assertIn(live.name, public)
        self.assertNotIn(off.name, public)
        mine = {t["name"] for t in self.as_user(self.host).get(url).data["ticket_tiers"]}
        self.assertIn(off.name, mine)
