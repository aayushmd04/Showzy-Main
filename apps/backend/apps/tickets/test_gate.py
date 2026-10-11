"""Gatekeepers (invited, event-scoped ticket checkers) and cross-account isolation."""

import uuid as _uuid
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import City
from apps.events.models import Event, EventStatus
from apps.notifications.models import Notification
from apps.tickets.models import GateAssignment, Order, OrderItem, Ticket, TicketTier
from apps.venues.models import Venue


class GateBase(TestCase):
    def setUp(self):
        U = get_user_model()
        self.host = U.objects.create_user(email="host@naada.test", full_name="Host", phone="+919000000001")
        self.other_host = U.objects.create_user(email="host2@naada.test", full_name="Host Two", phone="+919000000002")
        self.gk = U.objects.create_user(email="gate@naada.test", full_name="Gita Gate", phone="+919000000003")
        self.buyer = U.objects.create_user(email="buyer@naada.test", full_name="Buyer", phone="+919000000004")
        self.stranger = U.objects.create_user(email="nosy@naada.test", full_name="Nosy", phone="+919000000005")
        city = City.objects.create(name="Mysuru", slug="mysuru-gate")
        self.venue = Venue.objects.create(owner=self.host, name="Hall", slug="hall-gate",
                                          address_line1="1", city=city, capacity=100)
        self.event = self.make_event("Tonight", hours_from_now=1)
        self.other_event = self.make_event("Other night", hours_from_now=1, organizer=self.other_host)
        self.future_event = self.make_event("Next month", hours_from_now=24 * 30)
        self.ticket = self.make_ticket(self.event)
        self.other_ticket = self.make_ticket(self.other_event)

    def make_event(self, title, hours_from_now, organizer=None):
        return Event.objects.create(
            organizer=organizer or self.host, venue=self.venue, title=title,
            status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(hours=hours_from_now),
            end_datetime=timezone.now() + timedelta(hours=hours_from_now + 3))

    def make_ticket(self, event, user=None):
        user = user or self.buyer
        tier = TicketTier.objects.create(event=event, name="General", price=Decimal("100"), total_quantity=50)
        order = Order.objects.create(user=user, event=event, status=Order.Status.CONFIRMED,
                                     subtotal=100, total_amount=100)
        item = OrderItem.objects.create(order=order, tier=tier, quantity=1, unit_price=100, total_price=100)
        return Ticket.objects.create(order=order, order_item=item, user=user, event=event, tier=tier,
                                     ticket_number=f"T{_uuid.uuid4().hex[:8].upper()}", holder_name="Guest One",
                                     holder_email="guest@x.test", holder_phone="+919111111111")

    def as_user(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def scan(self, user, ticket):
        return self.as_user(user).post(reverse("tickets-scan", args=[ticket.qr_data]))

    def invite(self, event=None, **body):
        return self.as_user(self.host).post(
            reverse("gate-invite", args=[(event or self.event).id]), body, format="json")

    def make_active(self, event=None, user=None):
        return GateAssignment.objects.create(
            event=event or self.event, invited_by=self.host, invitee_email=(user or self.gk).email,
            user=user or self.gk, status=GateAssignment.Status.ACTIVE)


class GatekeeperAccessTests(GateBase):
    def test_a_plain_account_cannot_scan_or_list(self):
        self.assertEqual(self.scan(self.stranger, self.ticket).status_code, 403)
        r = self.as_user(self.stranger).get(reverse("event-attendees", args=[self.event.id]))
        self.assertEqual(r.status_code, 403)

    def test_invited_but_not_accepted_cannot_scan(self):
        self.assertEqual(self.invite(email="gate@naada.test").status_code, 201)
        self.assertEqual(self.scan(self.gk, self.ticket).status_code, 403)

    def test_invite_accept_then_scan_only_that_event(self):
        self.assertEqual(self.invite(email="GATE@naada.test", label="Main gate").status_code, 201)
        # They are told in-app.
        self.assertTrue(Notification.objects.filter(user=self.gk, title__icontains="invited").exists())

        mine = self.as_user(self.gk).get(reverse("gate-mine")).data
        self.assertEqual(len(mine["invitations"]), 1)
        aid = mine["invitations"][0]["id"]
        self.assertEqual(self.as_user(self.gk).post(reverse("gate-accept", args=[aid])).status_code, 200)

        resp = self.scan(self.gk, self.ticket)
        self.assertEqual(resp.status_code, 200, resp.data)
        # Narrow payload: no buyer email/phone for a gatekeeper.
        self.assertNotIn("holder_email", resp.data["ticket"])
        self.assertNotIn("holder_phone", resp.data["ticket"])
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.checked_in_by_id, self.gk.id)

        # Another organiser's event is off limits.
        self.assertEqual(self.scan(self.gk, self.other_ticket).status_code, 403)

    def test_phone_invite_matches_the_account_with_that_number(self):
        self.assertEqual(self.invite(phone="+919000000003").status_code, 201)
        self.assertEqual(len(self.as_user(self.gk).get(reverse("gate-mine")).data["invitations"]), 1)
        self.assertEqual(len(self.as_user(self.stranger).get(reverse("gate-mine")).data["invitations"]), 0)

    def test_someone_elses_invitation_cannot_be_accepted(self):
        self.invite(email="gate@naada.test")
        aid = GateAssignment.objects.get().id
        r = self.as_user(self.stranger).post(reverse("gate-accept", args=[aid]))
        self.assertEqual(r.status_code, 404)
        self.assertEqual(GateAssignment.objects.get().status, GateAssignment.Status.PENDING)

    def test_access_is_limited_to_the_event_window(self):
        a = self.make_active(self.future_event)
        ticket = self.make_ticket(self.future_event)
        r = self.scan(self.gk, ticket)
        self.assertEqual(r.status_code, 403)
        self.assertIn("gate access", str(r.data["detail"]))
        # ...and closes after the event.
        self.event.start_datetime = timezone.now() - timedelta(hours=20)
        self.event.end_datetime = timezone.now() - timedelta(hours=17)
        self.event.save()
        self.make_active(self.event)
        self.assertEqual(self.scan(self.gk, self.ticket).status_code, 403)

    def test_revoking_takes_effect_on_the_next_scan(self):
        a = self.make_active()
        self.assertEqual(self.as_user(self.host).delete(
            reverse("gate-revoke", args=[self.event.id, a.id])).status_code, 204)
        self.assertEqual(self.scan(self.gk, self.ticket).status_code, 403)

    def test_gatekeeper_cannot_manage_the_team_or_see_the_dashboard(self):
        self.make_active()
        c = self.as_user(self.gk)
        self.assertEqual(c.get(reverse("gate-overview", args=[self.event.id])).status_code, 403)
        self.assertEqual(c.post(reverse("gate-invite", args=[self.event.id]),
                                {"email": "x@y.com"}, format="json").status_code, 403)

    def test_gatekeeper_cannot_reach_host_or_other_buyers_data(self):
        self.make_active()
        c = self.as_user(self.gk)
        self.assertEqual(c.get(reverse("tickets-detail", args=[self.ticket.id])).status_code, 404)
        self.assertEqual(c.get(reverse("orders-invoice", args=[self.ticket.order_id])).status_code, 404)
        self.assertEqual(c.patch(reverse("events-detail", args=[self.event.id]),
                                 {"title": "Hacked"}, format="json").status_code, 403)
        self.assertEqual(c.patch(reverse("venues-detail", args=[self.venue.slug]),
                                 {"name": "Hacked"}, format="json").status_code, 403)

    def test_other_host_cannot_manage_my_gate(self):
        r = self.as_user(self.other_host).post(reverse("gate-invite", args=[self.event.id]),
                                               {"email": "a@b.com"}, format="json")
        self.assertEqual(r.status_code, 403)

    def test_invite_validation(self):
        self.assertEqual(self.invite().status_code, 400)
        self.assertEqual(self.invite(email="a@b.com", phone="+919999999999").status_code, 400)
        self.assertEqual(self.invite(email="nope").status_code, 400)
        self.assertEqual(self.invite(email="host@naada.test").status_code, 400)  # self
        self.assertEqual(self.invite(email="a@b.com").status_code, 201)
        self.assertEqual(self.invite(email="A@b.com").status_code, 400)  # duplicate

    def test_oversight_counts_every_scan_by_person(self):
        self.make_active()
        t2 = self.make_ticket(self.event)
        t3 = self.make_ticket(self.event)
        self.scan(self.gk, self.ticket)
        self.scan(self.gk, t2)
        self.scan(self.host, t3)
        data = self.as_user(self.host).get(reverse("gate-overview", args=[self.event.id])).data
        self.assertEqual(data["totals"]["admitted"], 3)
        self.assertEqual(data["totals"]["by_organiser"], 1)
        row = next(t for t in data["team"] if t["email"] == "gate@naada.test")
        self.assertEqual(row["scan_count"], 2)
        self.assertEqual(len(data["recent"]), 3)
        self.assertEqual({r["by_name"] for r in data["recent"]}, {"Gita Gate", "You"})


class AccountIsolationTests(GateBase):
    """One signed-in account must never read or change another account's things."""

    def test_buyer_one_cannot_touch_buyer_twos_ticket_or_order(self):
        c = self.as_user(self.stranger)
        t = self.ticket
        self.assertEqual(c.get(reverse("tickets-detail", args=[t.id])).status_code, 404)
        self.assertEqual(c.post(reverse("tickets-cancel", args=[t.id])).status_code, 404)
        self.assertEqual(c.post(reverse("tickets-transfer", args=[t.id]),
                                {"recipient_email": "nosy@naada.test"}, format="json").status_code, 404)
        self.assertEqual(c.get(reverse("orders-invoice", args=[t.order_id])).status_code, 404)
        self.assertEqual(c.get(reverse("tickets-mine")).data["count"], 0)
        self.assertEqual(len(c.get(reverse("orders-mine")).data), 0)

    def test_cannot_scan_someone_elses_ticket_to_burn_it(self):
        self.assertEqual(self.scan(self.stranger, self.ticket).status_code, 403)
        self.ticket.refresh_from_db()
        self.assertEqual(self.ticket.status, Ticket.Status.VALID)

    def test_cannot_read_or_mark_someone_elses_notification(self):
        from apps.notifications.dispatch import record
        from apps.notifications.models import NotificationType
        n = record(self.buyer, notification_type=NotificationType.WELCOME, title="hi", body="b")
        r = self.as_user(self.stranger).post(reverse("notifications-read", args=[n.id]))
        self.assertEqual(r.status_code, 404)

    def test_cannot_pay_or_refund_someone_elses_order(self):
        c = self.as_user(self.stranger)
        r = c.post(reverse("payments-initiate"), {"order_id": str(self.ticket.order_id)}, format="json")
        self.assertIn(r.status_code, (400, 403, 404))
        self.assertEqual(Order.objects.get(pk=self.ticket.order_id).status, Order.Status.CONFIRMED)

    def test_profile_patch_cannot_escalate_privileges(self):
        c = self.as_user(self.stranger)
        c.patch(reverse("auth-me"), {"role": "admin", "is_staff": True, "is_superuser": True}, format="json")
        c.post(reverse("auth-set-role"), {"role": "admin"}, format="json")
        self.stranger.refresh_from_db()
        self.assertNotEqual(self.stranger.role, "admin")
        self.assertFalse(self.stranger.is_staff)
        self.assertFalse(self.stranger.is_superuser)

    def test_anonymous_cannot_use_private_endpoints(self):
        c = APIClient()
        for name, args in [("tickets-mine", []), ("orders-mine", []), ("auth-me", []),
                           ("event-attendees", [self.event.id]), ("gate-mine", []),
                           ("gate-overview", [self.event.id])]:
            self.assertEqual(c.get(reverse(name, args=args)).status_code, 401, name)
        self.assertEqual(c.post(reverse("tickets-scan", args=[self.ticket.qr_data])).status_code, 401)
