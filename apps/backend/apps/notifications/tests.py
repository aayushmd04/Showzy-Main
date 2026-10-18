"""Tests for the notifications surface.

Three things are being protected here:

1. The moments that matter actually write a Notification. Until recently
   nothing ever created one, so the table was permanently empty and the whole
   feature was decorative.
2. Preferences gate email and *only* email. Turning off booking emails must
   never cost someone the in-app record — that row is the audit trail.
3. A notification is never allowed to break, or to leak. It must not take down
   the transaction that triggered it, and one user must never be able to read
   or touch another user's notifications.
"""

import uuid
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.artists.models import Artist
from apps.bookings.models import (
    BookingConversation,
    BookingOrder,
    GigApplication,
    Membership,
    Offer,
    Organizer,
)
from apps.core.models import City
from apps.events.models import Event, EventStatus
from apps.tickets.models import Order, OrderItem, Ticket, TicketTier
from apps.venues.models import Venue

from .models import Notification, NotificationPreference, NotificationType


class NotificationsTestCase(TestCase):
    """Shared cast: a host, an artist, a fan, and one gig they all touch."""

    def setUp(self):
        User = get_user_model()
        self.host = User.objects.create_user(
            email="host@naada.test", full_name="Meera Rao", phone="+919000000010")
        self.artist_user = User.objects.create_user(
            email="artist@naada.test", full_name="Rahul Iyer", phone="+919000000011")
        self.fan = User.objects.create_user(
            email="fan@naada.test", full_name="Anita Shetty", phone="+919000000012")

        self.city = City.objects.create(name="Mysuru", slug="mysuru")
        self.venue = Venue.objects.create(
            owner=self.host, name="The Humming Tree", slug="humming-tree",
            address_line1="12 Church Street", city=self.city, capacity=180)
        self.event = Event.objects.create(
            organizer=self.host, venue=self.venue, title="Raag Night",
            status=EventStatus.PUBLISHED, is_seeking_artists=True,
            start_datetime=timezone.now() + timedelta(days=14),
            end_datetime=timezone.now() + timedelta(days=14, hours=3))

        self.organizer = Organizer.objects.create(
            name="Humming Tree Presents", slug="humming-tree-presents")
        Membership.objects.create(
            user=self.host, organizer=self.organizer, role=Membership.Role.OWNER)
        self.artist = Artist.objects.create(
            user=self.artist_user, stage_name="Rahul Iyer", city=self.city)

        self.convo = BookingConversation.objects.create(
            organizer=self.organizer, artist=self.artist, event=self.event,
            initiated_by=self.host)

        self.host_client = APIClient()
        self.host_client.force_authenticate(user=self.host)
        self.artist_client = APIClient()
        self.artist_client.force_authenticate(user=self.artist_user)
        self.fan_client = APIClient()
        self.fan_client.force_authenticate(user=self.fan)

        # Accepting an offer schedules a Celery nudge. Without a broker that
        # call spends 20 seconds retrying Redis before giving up, which has
        # nothing to do with notifications and everything to do with test time.
        nudge = mock.patch("apps.bookings.tasks.kyc_nudge.apply_async")
        self.addCleanup(nudge.stop)
        nudge.start().return_value.id = "kyc-nudge-test"

        mail.outbox = []

    # ── helpers ──────────────────────────────────────────────────────────────

    def make_offer(self, client=None, **overrides):
        body = {
            "fee_amount": "8000.00",
            "performance_date": (timezone.now() + timedelta(days=14)).date().isoformat(),
            "performance_duration_minutes": 60,
            "set_count": 2,
        }
        body.update(overrides)
        resp = (client or self.host_client).post(
            reverse("booking-offer", args=[self.convo.id]), body, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        return Offer.objects.get(pk=resp.data["id"])

    def notes_for(self, user, kind=None):
        qs = Notification.objects.filter(user=user)
        if kind:
            qs = qs.filter(notification_type=kind)
        return list(qs)

    def buy_ticket(self, user):
        tier = TicketTier.objects.create(
            event=self.event, name="General", price=Decimal("400.00"),
            total_quantity=100)
        order = Order.objects.create(
            user=user, event=self.event, total_amount=Decimal("400.00"),
            subtotal=Decimal("400.00"), status=Order.Status.CONFIRMED)
        item = OrderItem.objects.create(
            order=order, tier=tier, quantity=1,
            unit_price=tier.price, total_price=tier.price)
        return Ticket.objects.create(
            order=order, order_item=item, user=user, event=self.event, tier=tier,
            ticket_number=f"SHOWZY{uuid.uuid4().hex[:8].upper()}")


class OfferNotificationTests(NotificationsTestCase):

    def test_offer_reaches_the_artist_not_the_sender(self):
        self.make_offer()

        received = self.notes_for(self.artist_user, NotificationType.BOOKING_OFFER)
        self.assertEqual(len(received), 1)
        note = received[0]
        self.assertIn("Humming Tree Presents", note.title)
        self.assertIn("8,000", note.body)
        self.assertEqual(note.action_url, "/artist/offers")
        self.assertFalse(note.is_read)
        # The host made the offer; the host does not need telling about it.
        self.assertEqual(self.notes_for(self.host), [])
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["artist@naada.test"])

    def test_artist_offer_reaches_every_active_organiser_member(self):
        User = get_user_model()
        colleague = User.objects.create_user(
            email="door@naada.test", full_name="Sunil K", phone="+919000000013")
        Membership.objects.create(
            user=colleague, organizer=self.organizer, role=Membership.Role.STAFF)

        self.make_offer(client=self.artist_client)

        self.assertEqual(
            len(self.notes_for(self.host, NotificationType.BOOKING_OFFER)), 1)
        self.assertEqual(
            len(self.notes_for(colleague, NotificationType.BOOKING_OFFER)), 1)
        self.assertEqual(self.notes_for(self.artist_user), [])

    def test_accepting_tells_the_person_who_made_the_offer(self):
        offer = self.make_offer()
        mail.outbox = []

        resp = self.artist_client.post(reverse("offer-accept", args=[offer.id]))
        self.assertEqual(resp.status_code, 201, resp.data)

        received = self.notes_for(self.host, NotificationType.BOOKING_OFFER_ACCEPTED)
        self.assertEqual(len(received), 1)
        self.assertIn("Rahul Iyer accepted your offer", received[0].title)
        self.assertEqual(received[0].action_url, "/host/bookings")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["host@naada.test"])

    def test_rejecting_tells_the_person_who_made_the_offer(self):
        offer = self.make_offer()

        resp = self.artist_client.post(reverse("offer-reject", args=[offer.id]))
        self.assertEqual(resp.status_code, 200, resp.data)

        received = self.notes_for(self.host, NotificationType.BOOKING_OFFER_DECLINED)
        self.assertEqual(len(received), 1)
        self.assertIn("passed on", received[0].title)

    def test_withdrawing_tells_the_side_that_was_waiting(self):
        offer = self.make_offer()

        resp = self.host_client.post(reverse("offer-reject", args=[offer.id]))
        self.assertEqual(resp.status_code, 200, resp.data)

        received = self.notes_for(
            self.artist_user, NotificationType.BOOKING_OFFER_WITHDRAWN)
        self.assertEqual(len(received), 1)
        self.assertIn("withdrew", received[0].title)
        # The host withdrew it — they don't need to be told what they just did.
        self.assertEqual(
            self.notes_for(self.host, NotificationType.BOOKING_OFFER_WITHDRAWN), [])

    def test_a_failed_notification_does_not_undo_the_booking(self):
        offer = self.make_offer()
        with mock.patch(
            "apps.notifications.dispatch.record",
            side_effect=RuntimeError("notification backend is down"),
        ):
            resp = self.artist_client.post(reverse("offer-accept", args=[offer.id]))

        self.assertEqual(resp.status_code, 201, resp.data)
        offer.refresh_from_db()
        self.assertEqual(offer.status, Offer.Status.ACCEPTED)
        self.assertTrue(BookingOrder.objects.filter(offer=offer).exists())
        # Nothing was written, and nothing was rolled back either.
        self.assertEqual(self.notes_for(self.host), [])


class GigApplicationNotificationTests(NotificationsTestCase):

    def review(self, status_value):
        application = GigApplication.objects.create(
            event=self.event, artist=self.artist, proposed_fee=Decimal("6000.00"))
        # `_assert_event_organizer` compares Event.organizer_id (a *User* id)
        # against the caller's Organizer ids, so it can never pass for anyone —
        # a pre-existing bug in bookings/views.py, outside this change's remit.
        # Stubbing it lets these tests exercise the thing they're actually
        # about: that the review decision reaches the artist.
        with mock.patch("apps.bookings.views._assert_event_organizer"):
            resp = self.host_client.patch(
                reverse("gig-review", args=[application.id]),
                {"status": status_value}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        application.refresh_from_db()
        return application

    def test_acceptance_reaches_the_artist(self):
        self.review("accepted")
        received = self.notes_for(
            self.artist_user, NotificationType.GIG_APPLICATION_REVIEWED)
        self.assertEqual(len(received), 1)
        self.assertIn("Raag Night", received[0].title)
        self.assertIn("Meera Rao", received[0].body)
        self.assertEqual(received[0].data["status"], "accepted")

    def test_rejection_reaches_the_artist_too(self):
        self.review("rejected")
        received = self.notes_for(
            self.artist_user, NotificationType.GIG_APPLICATION_REVIEWED)
        self.assertEqual(len(received), 1)
        self.assertIn("went to someone else", received[0].title)


class EventChangeNotificationTests(NotificationsTestCase):

    def setUp(self):
        super().setUp()
        self.buy_ticket(self.fan)

    def test_cancelling_tells_every_ticket_holder(self):
        resp = self.host_client.patch(
            reverse("events-detail", args=[self.event.id]),
            {"status": EventStatus.CANCELLED}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

        received = self.notes_for(self.fan, NotificationType.EVENT_CANCELLED)
        self.assertEqual(len(received), 1)
        self.assertIn("Raag Night is cancelled", received[0].title)
        self.assertEqual(received[0].action_url, "/tickets")
        self.assertEqual(len(mail.outbox), 1)

    def test_moving_the_start_time_tells_every_ticket_holder(self):
        new_start = self.event.start_datetime + timedelta(days=1)
        resp = self.host_client.patch(
            reverse("events-detail", args=[self.event.id]),
            {"start_datetime": new_start.isoformat()}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

        received = self.notes_for(self.fan, NotificationType.EVENT_UPDATED)
        self.assertEqual(len(received), 1)
        self.assertIn("new time", received[0].title)

    def test_an_edit_that_changes_nothing_material_stays_quiet(self):
        resp = self.host_client.patch(
            reverse("events-detail", args=[self.event.id]),
            {"description": "Doors at 7. Bring a cushion."}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(self.notes_for(self.fan), [])
        self.assertEqual(mail.outbox, [])

    def test_deleting_the_event_reads_as_a_cancellation(self):
        resp = self.host_client.delete(reverse("events-detail", args=[self.event.id]))
        self.assertEqual(resp.status_code, 204)

        received = self.notes_for(self.fan, NotificationType.EVENT_CANCELLED)
        self.assertEqual(len(received), 1)


class PreferenceTests(NotificationsTestCase):

    def test_booking_preference_suppresses_email_but_keeps_the_in_app_row(self):
        NotificationPreference.objects.create(
            user=self.artist_user, booking_activity_email=False)

        self.make_offer()

        self.assertEqual(
            len(self.notes_for(self.artist_user, NotificationType.BOOKING_OFFER)), 1)
        self.assertEqual(mail.outbox, [])

    def test_event_change_preference_suppresses_email_but_keeps_the_in_app_row(self):
        NotificationPreference.objects.create(user=self.fan, event_change_email=False)
        self.buy_ticket(self.fan)

        self.host_client.patch(
            reverse("events-detail", args=[self.event.id]),
            {"status": EventStatus.CANCELLED}, format="json")

        self.assertEqual(
            len(self.notes_for(self.fan, NotificationType.EVENT_CANCELLED)), 1)
        self.assertEqual(mail.outbox, [])

    def test_preferences_endpoint_creates_a_row_and_accepts_a_patch(self):
        url = reverse("notifications-prefs")
        resp = self.fan_client.get(url)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["booking_activity_email"])

        resp = self.fan_client.patch(url, {"marketing_email": True}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(
            NotificationPreference.objects.get(user=self.fan).marketing_email)


class ReadStateTests(NotificationsTestCase):

    def setUp(self):
        super().setUp()
        self.make_offer()
        self.make_offer(performance_date=(
            timezone.now() + timedelta(days=21)).date().isoformat())
        self.notes = self.notes_for(self.artist_user)
        self.assertEqual(len(self.notes), 2)

    def test_list_returns_only_the_signed_in_users_notifications(self):
        resp = self.artist_client.get(reverse("notifications-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 2)

        resp = self.fan_client.get(reverse("notifications-list"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["results"], [])

    def test_unread_filter(self):
        self.notes[0].mark_read()
        resp = self.artist_client.get(reverse("notifications-list"), {"unread": "true"})
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["id"], str(self.notes[1].id))

    def test_mark_one_read(self):
        target = self.notes[0]
        resp = self.artist_client.post(
            reverse("notifications-read", args=[target.id]))
        self.assertEqual(resp.status_code, 200)
        target.refresh_from_db()
        self.assertTrue(target.is_read)
        self.assertIsNotNone(target.read_at)
        self.notes[1].refresh_from_db()
        self.assertFalse(self.notes[1].is_read)

    def test_mark_all_read(self):
        resp = self.artist_client.post(reverse("notifications-read-all"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            Notification.objects.filter(user=self.artist_user, is_read=False).count(), 0)
        self.assertTrue(
            all(n.read_at for n in Notification.objects.filter(user=self.artist_user)))

    def test_anonymous_callers_get_401_not_a_list(self):
        anon = APIClient()
        for url in (reverse("notifications-list"), reverse("notifications-prefs")):
            self.assertIn(anon.get(url).status_code, (401, 403))
        self.assertIn(
            anon.post(reverse("notifications-read-all")).status_code, (401, 403))


class AccessControlTests(NotificationsTestCase):
    """One user must never see, read or clear another user's notifications."""

    def setUp(self):
        super().setUp()
        self.offer = self.make_offer()
        self.artist_note = self.notes_for(self.artist_user)[0]

    def test_a_stranger_cannot_read_someone_elses_notification(self):
        resp = self.fan_client.post(
            reverse("notifications-read", args=[self.artist_note.id]))
        self.assertEqual(resp.status_code, 404)
        self.artist_note.refresh_from_db()
        self.assertFalse(self.artist_note.is_read)

    def test_the_host_in_the_same_conversation_still_cannot_read_it(self):
        # Being a party to the booking is not the same as owning the row.
        resp = self.host_client.post(
            reverse("notifications-read", args=[self.artist_note.id]))
        self.assertEqual(resp.status_code, 404)
        self.artist_note.refresh_from_db()
        self.assertFalse(self.artist_note.is_read)

    def test_mark_all_read_never_reaches_across_users(self):
        resp = self.fan_client.post(reverse("notifications-read-all"))
        self.assertEqual(resp.status_code, 200)
        self.artist_note.refresh_from_db()
        self.assertFalse(self.artist_note.is_read)

    def test_a_stranger_never_sees_the_row_in_a_listing(self):
        resp = self.fan_client.get(reverse("notifications-list"))
        ids = [row["id"] for row in resp.data["results"]]
        self.assertNotIn(str(self.artist_note.id), ids)


class SenderAddressTests(TestCase):
    """Each kind of mail goes out from its own address on the sending subdomain."""

    def test_ticket_and_refund_mail_uses_the_tickets_address(self):
        from apps.notifications.dispatch import sender_for

        self.assertIn("tickets@mail.showzy.in", sender_for("ticket_confirmed"))
        self.assertIn("tickets@mail.showzy.in", sender_for("refund_processed"))

    def test_everything_else_uses_the_alerts_address(self):
        from apps.notifications.dispatch import sender_for

        for kind in ("booking_offer", "event_cancelled", "gig_application_reviewed", None):
            self.assertIn("alerts@mail.showzy.in", sender_for(kind))

    def test_sign_in_code_uses_the_auth_address(self):
        from django.core import mail
        from django.core.cache import cache
        from django.urls import reverse
        from rest_framework.test import APIClient

        cache.clear()
        resp = APIClient().post(
            reverse("auth-request-otp"), {"email": "a@naada.test"}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertIn("auth@mail.showzy.in", mail.outbox[0].from_email)
        cache.clear()
