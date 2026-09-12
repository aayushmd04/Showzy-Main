"""Tests for the ops/admin console endpoints.

These exist because every one of these screens was previously wired to the
signed-in user's own data (or to nothing at all) — an admin has no bookings,
settlements or messages of their own, so every number on that console was
blank or wrong. The point of these tests is to lock in that admin-scoped
queries return platform-wide data regardless of who's asking, and that a
non-admin can't reach any of it.
"""

from decimal import Decimal
from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.artists.models import Artist
from .models import (
    Organizer, BookingConversation, BookingMessage, Offer, BookingOrder,
    Transfer, LedgerEntry, Dispute,
)

User = get_user_model()


def make_booking_order(organizer, artist, gross=Decimal("10000.00")):
    """A funded booking order with correct fee math, for ledger/transfer tests."""
    platform_fee = (gross * Decimal("0.10")).quantize(Decimal("0.01"))
    tds = (gross * Decimal("0.01")).quantize(Decimal("0.01"))
    payout = gross - platform_fee - tds
    offer = Offer.objects.create(
        conversation=BookingConversation.objects.create(organizer=organizer, artist=artist),
        proposed_by=organizer.memberships.first().user,
        fee_amount=gross,
        performance_date=timezone.now().date(),
    )
    return BookingOrder.objects.create(
        offer=offer, organizer=organizer, artist=artist,
        status=BookingOrder.Status.FUNDED,
        gross_amount=gross, platform_fee=platform_fee, tds_amount=tds, artist_payout=payout,
        performance_date=timezone.now().date(),
    )


class AdminOpsTestCase(TestCase):
    """One admin, one non-admin, one organizer + artist pair to book against."""

    def setUp(self):
        self.admin = User.objects.create_user(
            email="ops@naada.test", full_name="Ops Admin", is_staff=True, role="admin")
        self.civilian = User.objects.create_user(
            email="civilian@naada.test", full_name="Just A User")
        self.host_user = User.objects.create_user(email="host@naada.test", full_name="Priya Host")
        self.artist_user = User.objects.create_user(email="artist@naada.test", full_name="Arjun Artist")

        self.organizer = Organizer.objects.create(name="Gokulam Hall", slug="gokulam-ops-test")
        self.organizer.memberships.create(user=self.host_user, role="owner")
        self.artist = Artist.objects.create(user=self.artist_user, stage_name="Arjun Live")

        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)
        self.civilian_client = APIClient()
        self.civilian_client.force_authenticate(user=self.civilian)


class PermissionGatingTests(AdminOpsTestCase):
    """Every new admin endpoint must refuse a non-admin, regardless of the verb."""

    def test_non_admin_cannot_reach_overview(self):
        resp = self.civilian_client.get(reverse("admin-overview"))
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_reach_ledger(self):
        resp = self.civilian_client.get(reverse("admin-ledger"))
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_reach_organizer_kyc_queue(self):
        resp = self.civilian_client.get(reverse("admin-organizer-kyc-queue"))
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_set_organizer_kyc(self):
        resp = self.civilian_client.post(
            reverse("admin-organizer-kyc-set", args=[self.organizer.id]), {"status": "verified"})
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_review_flagged_message(self):
        convo = BookingConversation.objects.create(organizer=self.organizer, artist=self.artist)
        msg = BookingMessage.objects.create(conversation=convo, sender=self.host_user, content="hi")
        resp = self.civilian_client.post(reverse("admin-flagged-message-review", args=[msg.id]))
        self.assertEqual(resp.status_code, 403)


class AdminOverviewTests(AdminOpsTestCase):
    """The four headline counts on the ops console home."""

    def test_counts_are_platform_wide_not_the_caller_s_own(self):
        # The admin has none of these themselves — every number must still
        # reflect what exists on the platform, not the admin's own (empty) data.
        self.organizer.kyc_status = Organizer.KYCStatus.SUBMITTED
        self.organizer.save(update_fields=["kyc_status"])

        order = make_booking_order(self.organizer, self.artist)
        Dispute.objects.create(booking_order=order, raised_by=self.host_user, reason="No-show")
        Transfer.objects.create(
            booking_order=order, razorpay_transfer_id="trf_test1",
            razorpay_payment_id="pay_test1", amount=Decimal("8900.00"),
            recipient_account_id="acc_test1", on_hold=True,
        )
        convo = BookingConversation.objects.create(organizer=self.organizer, artist=self.artist)
        BookingMessage.objects.create(
            conversation=convo, sender=self.host_user, content="call me on 9845011223")

        resp = self.admin_client.get(reverse("admin-overview"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["pending_kyc"], 1)
        self.assertEqual(resp.data["open_disputes"], 1)
        self.assertEqual(resp.data["flagged_messages"], 1)
        self.assertEqual(resp.data["held_transfers"], 1)

    def test_reviewing_a_flagged_message_drops_it_from_the_count(self):
        convo = BookingConversation.objects.create(organizer=self.organizer, artist=self.artist)
        msg = BookingMessage.objects.create(
            conversation=convo, sender=self.host_user, content="ping me at test@example.com")
        self.assertEqual(
            self.admin_client.get(reverse("admin-overview")).data["flagged_messages"], 1)

        self.admin_client.post(reverse("admin-flagged-message-review", args=[msg.id]))

        self.assertEqual(
            self.admin_client.get(reverse("admin-overview")).data["flagged_messages"], 0)


class FlaggedMessagesQueueTests(AdminOpsTestCase):
    def setUp(self):
        super().setUp()
        self.convo = BookingConversation.objects.create(organizer=self.organizer, artist=self.artist)

    def test_only_unreviewed_flagged_messages_appear_by_default(self):
        flagged = BookingMessage.objects.create(
            conversation=self.convo, sender=self.host_user, content="reach me on 9845011223")
        BookingMessage.objects.create(
            conversation=self.convo, sender=self.host_user, content="looking forward to the gig")

        resp = self.admin_client.get(reverse("admin-flagged-messages"))
        ids = [m["id"] for m in resp.data]
        self.assertEqual(ids, [str(flagged.id)])
        self.assertEqual(resp.data[0]["flag_reason"], flagged.flag_reason)
        self.assertEqual(resp.data[0]["organizer_name"], self.organizer.name)
        self.assertEqual(resp.data[0]["artist_name"], self.artist.stage_name)

    def test_reviewing_moves_a_message_from_default_queue_to_reviewed_filter(self):
        msg = BookingMessage.objects.create(
            conversation=self.convo, sender=self.host_user, content="my email is a@b.com")

        review = self.admin_client.post(reverse("admin-flagged-message-review", args=[msg.id]))
        self.assertEqual(review.status_code, 200)
        self.assertIsNotNone(review.data["reviewed_at"])

        default_queue = self.admin_client.get(reverse("admin-flagged-messages"))
        self.assertEqual(default_queue.data, [])

        reviewed_queue = self.admin_client.get(reverse("admin-flagged-messages"), {"reviewed": "1"})
        self.assertEqual([m["id"] for m in reviewed_queue.data], [str(msg.id)])

    def test_reviewing_twice_is_a_no_op(self):
        msg = BookingMessage.objects.create(
            conversation=self.convo, sender=self.host_user, content="9845011223 call now")
        first = self.admin_client.post(reverse("admin-flagged-message-review", args=[msg.id])).data
        second = self.admin_client.post(reverse("admin-flagged-message-review", args=[msg.id])).data
        self.assertEqual(first["reviewed_at"], second["reviewed_at"])

    def test_reviewing_missing_message_404s(self):
        import uuid
        resp = self.admin_client.post(
            reverse("admin-flagged-message-review", args=[uuid.uuid4()]))
        self.assertEqual(resp.status_code, 404)


class AdminLedgerTests(AdminOpsTestCase):
    def test_ledger_lists_entries_across_every_booking_order(self):
        order_a = make_booking_order(self.organizer, self.artist, gross=Decimal("5000.00"))
        other_artist = Artist.objects.create(
            user=User.objects.create_user(email="artist2@naada.test", full_name="Second Artist"),
            stage_name="Second Act")
        order_b = make_booking_order(self.organizer, other_artist, gross=Decimal("7000.00"))

        LedgerEntry.objects.create(
            booking_order=order_a, entry_type=LedgerEntry.EntryType.GROSS_CHARGE, amount=Decimal("5000.00"))
        LedgerEntry.objects.create(
            booking_order=order_b, entry_type=LedgerEntry.EntryType.ARTIST_PAYOUT, amount=Decimal("-6230.00"))

        resp = self.admin_client.get(reverse("admin-ledger"))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)
        artist_names = {row["artist_name"] for row in resp.data["results"]}
        self.assertEqual(artist_names, {"Arjun Live", "Second Act"})

    def test_ledger_can_be_filtered_by_entry_type(self):
        order = make_booking_order(self.organizer, self.artist)
        LedgerEntry.objects.create(
            booking_order=order, entry_type=LedgerEntry.EntryType.GROSS_CHARGE, amount=Decimal("10000.00"))
        LedgerEntry.objects.create(
            booking_order=order, entry_type=LedgerEntry.EntryType.PLATFORM_FEE, amount=Decimal("-1000.00"))

        resp = self.admin_client.get(reverse("admin-ledger"), {"type": "platform_fee"})
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["entry_type"], "platform_fee")


class OrganizerKycTests(AdminOpsTestCase):
    def test_queue_orders_submitted_and_pending_before_settled_statuses(self):
        verified = Organizer.objects.create(
            name="Verified Venue", slug="verified-venue", kyc_status=Organizer.KYCStatus.VERIFIED)
        submitted = Organizer.objects.create(
            name="Submitted Venue", slug="submitted-venue", kyc_status=Organizer.KYCStatus.SUBMITTED)
        # self.organizer defaults to PENDING from setUp.

        resp = self.admin_client.get(reverse("admin-organizer-kyc-queue"))
        names = [row["name"] for row in resp.data]
        self.assertLess(names.index(submitted.name), names.index(verified.name))
        self.assertLess(names.index(self.organizer.name), names.index(verified.name))

    def test_verifying_sets_status_and_can_book_artists_flips_true(self):
        self.assertFalse(self.organizer.can_book_artists)
        resp = self.admin_client.post(
            reverse("admin-organizer-kyc-set", args=[self.organizer.id]), {"status": "verified"})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["kyc_status"], "verified")
        self.assertTrue(resp.data["can_book_artists"])
        self.assertIsNotNone(resp.data["kyc_verified_at"])

        self.organizer.refresh_from_db()
        self.assertTrue(self.organizer.is_verified)

    def test_rejecting_records_a_reason_and_leaves_booking_gated(self):
        resp = self.admin_client.post(
            reverse("admin-organizer-kyc-set", args=[self.organizer.id]),
            {"status": "rejected", "rejection_reason": "PAN mismatch"},
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["kyc_status"], "rejected")
        self.assertEqual(resp.data["kyc_rejection_reason"], "PAN mismatch")
        self.assertFalse(resp.data["can_book_artists"])

    def test_invalid_status_value_is_rejected(self):
        resp = self.admin_client.post(
            reverse("admin-organizer-kyc-set", args=[self.organizer.id]), {"status": "pending"})
        self.assertEqual(resp.status_code, 400)

    def test_missing_organizer_404s(self):
        import uuid
        resp = self.admin_client.post(
            reverse("admin-organizer-kyc-set", args=[uuid.uuid4()]), {"status": "verified"})
        self.assertEqual(resp.status_code, 404)
