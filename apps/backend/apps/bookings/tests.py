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
    agreed = gross
    platform_fee = (agreed * Decimal("0.05")).quantize(Decimal("0.01"))
    tds = (agreed * Decimal("0.01")).quantize(Decimal("0.01"))
    payout = agreed - tds
    gross = agreed + platform_fee
    offer = Offer.objects.create(
        conversation=BookingConversation.objects.create(organizer=organizer, artist=artist),
        proposed_by=organizer.memberships.first().user,
        fee_amount=agreed,
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
        # `self.artist` (from setUp) defaults to pending KYC too, and
        # pending_kyc now spans all three payout-receiving entities — verify
        # it out of the way here so this test stays about the organizer.
        self.artist.kyc_status = "verified"
        self.artist.save(update_fields=["kyc_status"])

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

    def test_pending_kyc_spans_organizer_artist_and_venue(self):
        from apps.venues.models import Venue
        from apps.core.models import City

        self.artist.kyc_status = "verified"
        self.artist.save(update_fields=["kyc_status"])
        self.organizer.kyc_status = Organizer.KYCStatus.VERIFIED
        self.organizer.save(update_fields=["kyc_status"])
        self.assertEqual(self.admin_client.get(reverse("admin-overview")).data["pending_kyc"], 0)

        self.artist.kyc_status = "submitted"
        self.artist.save(update_fields=["kyc_status"])
        self.assertEqual(self.admin_client.get(reverse("admin-overview")).data["pending_kyc"], 1)

        city = City.objects.create(name="Test City", slug="test-city-overview")
        Venue.objects.create(
            owner=self.host_user, name="Test Venue", slug="test-venue-overview",
            address_line1="x", city=city, kyc_status="pending",
        )
        self.assertEqual(self.admin_client.get(reverse("admin-overview")).data["pending_kyc"], 2)

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


class OrganizerDetailPrivacyTests(AdminOpsTestCase):
    """`GET /organizers/<pk>/` carries GSTIN, PAN, KYC status and contact
    details — the write path (`PATCH`) already required membership, but the
    read path did not, so any signed-in user who had (or guessed) an
    organizer's id could read another company's compliance data.
    """

    def setUp(self):
        super().setUp()
        self.organizer.gst_number = "29ABCDE1234F1Z5"
        self.organizer.contact_email = "ops@gokulamhall.test"
        self.organizer.save()

    def test_a_member_can_read_it(self):
        client = APIClient()
        client.force_authenticate(user=self.host_user)
        resp = client.get(reverse("organizers-detail", args=[self.organizer.id]))
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["gst_number"], "29ABCDE1234F1Z5")

    def test_a_non_member_cannot_read_it(self):
        resp = self.civilian_client.get(reverse("organizers-detail", args=[self.organizer.id]))
        self.assertEqual(resp.status_code, 403)

    def test_staff_with_no_membership_here_still_needs_the_admin_endpoint(self):
        # is_staff alone doesn't bypass this member-only endpoint — that's
        # what the dedicated admin-prefixed endpoints are for.
        resp = self.admin_client.get(reverse("organizers-detail", args=[self.organizer.id]))
        self.assertEqual(resp.status_code, 403)


class DisputeQueueShapeTests(AdminOpsTestCase):
    """The ops console has to be able to say who raised a dispute.

    `raised_by` is the raw user id, and the console was reading `.full_name`
    off it — which on a string is `undefined`, so every row rendered "Raised
    by" followed by nothing. The name now travels flat, alongside the email
    that was already there.
    """

    def setUp(self):
        super().setUp()
        self.order = make_booking_order(self.organizer, self.artist)

    def _queue(self):
        resp = self.admin_client.get(reverse("admin-dispute-queue"))
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data

    def test_queue_carries_the_raisers_name_and_email(self):
        Dispute.objects.create(
            booking_order=self.order, raised_by=self.host_user, reason="Turned up late.")

        row = self._queue()[0]
        self.assertEqual(str(row["raised_by"]), str(self.host_user.id))
        self.assertEqual(row["raised_by_name"], "Priya Host")
        self.assertEqual(row["raised_by_email"], "host@naada.test")

    def test_an_erased_account_leaves_the_dispute_readable(self):
        # `raised_by` is SET_NULL, so a user exercising their right to erasure
        # keeps the dispute row and loses the link. It must not 500.
        dispute = Dispute.objects.create(
            booking_order=self.order, raised_by=self.host_user, reason="Turned up late.")
        dispute.raised_by = None
        dispute.save(update_fields=["raised_by"])

        row = self._queue()[0]
        self.assertIsNone(row["raised_by"])
        self.assertIsNone(row["raised_by_name"])
        self.assertIsNone(row["raised_by_email"])

    def test_created_at_is_a_full_timestamp(self):
        # Pins the shape the frontend's date formatters must cope with — they
        # used to throw on it, taking the whole screen down.
        Dispute.objects.create(
            booking_order=self.order, raised_by=self.host_user, reason="Turned up late.")

        self.assertRegex(self._queue()[0]["created_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}")


class FeeMathTests(TestCase):
    """The platform fee is paid by the venue on top; the artist is never charged.

    These pin the one rule every screen and the ledger depend on, so the fee in
    the copy cannot drift from the fee in the money.
    """

    def test_fee_is_five_percent_added_on_top_for_the_venue(self):
        from apps.bookings.serializers import compute_fees

        platform_fee, tds, payout, gross = compute_fees(Decimal("15000"))
        self.assertEqual(platform_fee, Decimal("750.00"))
        self.assertEqual(gross, Decimal("15750.00"))  # what the venue pays

    def test_the_artist_receives_the_agreed_fee_less_tds_only(self):
        from apps.bookings.serializers import compute_fees

        platform_fee, tds, payout, gross = compute_fees(Decimal("15000"))
        self.assertEqual(tds, Decimal("150.00"))
        self.assertEqual(payout, Decimal("14850.00"))

    def test_the_ledger_always_balances(self):
        from apps.bookings.serializers import compute_fees

        for agreed in ("1", "999", "1234.56", "5000", "15000", "250000.99"):
            platform_fee, tds, payout, gross = compute_fees(Decimal(agreed))
            self.assertEqual(payout + platform_fee + tds, gross, agreed)

    def test_the_rate_comes_from_settings(self):
        from django.test import override_settings

        from apps.bookings.serializers import compute_fees

        with override_settings(PLATFORM_FEE_PCT="0.08"):
            platform_fee, _tds, _payout, gross = compute_fees(Decimal("10000"))
        self.assertEqual(platform_fee, Decimal("800.00"))
        self.assertEqual(gross, Decimal("10800.00"))
