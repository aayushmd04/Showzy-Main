"""Tests for venue GST/PAN/KYC/bank-details — the mirror image of
apps.artists.tests. See that file's docstring for why these exist.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import City, KYCStatus
from .models import Venue

User = get_user_model()


class VenuePayoutTestCase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="payout-host@naada.test", full_name="Payout Host")
        self.city = City.objects.create(name="Mysuru", slug="mysuru-payout")
        self.venue = Venue.objects.create(
            owner=self.owner, name="Payout Test Hall", slug="payout-test-hall",
            address_line1="1 Test Lane", city=self.city, capacity=100,
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

        self.admin = User.objects.create_user(
            email="payout-admin2@naada.test", full_name="Ops Admin", is_staff=True, role="admin")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)


class BankDetailsMaskingTests(VenuePayoutTestCase):
    def test_full_account_number_is_never_returned(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"bank_account_number": "555566667777", "bank_ifsc_code": "HDFC0001234",
             "bank_account_holder_name": "Payout Test Hall"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn("bank_account_number", resp.data)
        self.assertEqual(resp.data["bank_account_last4"], "7777")

        get_resp = self.client.get(reverse("venues-detail", args=[self.venue.slug]))
        self.assertNotIn("bank_account_number", get_resp.data)
        self.assertEqual(get_resp.data["bank_account_last4"], "7777")

    def test_account_number_is_actually_persisted_server_side(self):
        self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"bank_account_number": "111199998888", "bank_ifsc_code": "SBIN0005678"},
            format="json",
        )
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.bank_account_number, "111199998888")

    def test_no_bank_details_means_has_bank_details_is_false(self):
        resp = self.client.get(reverse("venues-detail", args=[self.venue.slug]))
        self.assertFalse(resp.data["has_bank_details"])
        self.assertEqual(resp.data["bank_account_last4"], "")


class KycAutoSubmitTests(VenuePayoutTestCase):
    def test_saving_bank_details_moves_pending_kyc_to_submitted(self):
        self.assertEqual(self.venue.kyc_status, KYCStatus.PENDING)
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"bank_account_number": "123456789012", "bank_ifsc_code": "HDFC0001234"},
            format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "submitted")
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.kyc_status, KYCStatus.SUBMITTED)
        self.assertIsNotNone(self.venue.kyc_submitted_at)

    def test_saving_gst_alone_also_submits_for_review(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"gst_number": "29ABCDE1234F1Z5"}, format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "submitted")

    def test_unrelated_field_edit_does_not_trigger_submission(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"tagline": "A lovely little room."}, format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "pending")

    def test_venue_owner_cannot_self_verify_kyc(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"kyc_status": "verified"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.kyc_status, KYCStatus.PENDING)

    def test_new_venue_created_with_bank_details_in_one_shot_still_submits(self):
        resp = self.client.post(
            reverse("venues-list"),
            {
                "name": "Fresh Venue", "address_line1": "2 New Rd", "city": str(self.city.id),
                "capacity": 50, "bank_account_number": "444455556666", "bank_ifsc_code": "ICIC0009999",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        created = Venue.objects.get(slug=resp.data["slug"])
        self.assertEqual(created.kyc_status, KYCStatus.SUBMITTED)


class FormatValidationTests(VenuePayoutTestCase):
    def test_valid_gstin_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"gst_number": "29abcde1234f1z5"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["gst_number"], "29ABCDE1234F1Z5")

    def test_malformed_gstin_is_rejected(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"gst_number": "not-a-gstin"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_pan_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"pan_number": "abcde1234f"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["pan_number"], "ABCDE1234F")

    def test_malformed_pan_is_rejected(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"pan_number": "12345"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_ifsc_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"bank_ifsc_code": "hdfc0001234"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["bank_ifsc_code"], "HDFC0001234")

    def test_malformed_ifsc_is_rejected(self):
        resp = self.client.patch(
            reverse("venues-detail", args=[self.venue.slug]),
            {"bank_ifsc_code": "12345"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)


class AdminVenueKycTests(VenuePayoutTestCase):
    def test_non_admin_cannot_reach_kyc_queue(self):
        resp = self.client.get(reverse("admin-venue-kyc-queue"))
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_set_kyc(self):
        resp = self.client.post(
            reverse("admin-venue-kyc-set", args=[self.venue.slug]), {"status": "verified"})
        self.assertEqual(resp.status_code, 403)

    def test_queue_orders_submitted_before_pending_before_rejected(self):
        submitted = Venue.objects.create(
            owner=self.owner, name="Submitted Hall", slug="submitted-hall",
            address_line1="x", city=self.city, kyc_status=KYCStatus.SUBMITTED)
        rejected = Venue.objects.create(
            owner=self.owner, name="Rejected Hall", slug="rejected-hall",
            address_line1="x", city=self.city, kyc_status=KYCStatus.REJECTED)
        verified = Venue.objects.create(
            owner=self.owner, name="Verified Hall", slug="verified-hall",
            address_line1="x", city=self.city, kyc_status=KYCStatus.VERIFIED)

        resp = self.admin_client.get(reverse("admin-venue-kyc-queue"))
        names = [row["name"] for row in resp.data]
        self.assertLess(names.index(submitted.name), names.index(self.venue.name))
        self.assertLess(names.index(self.venue.name), names.index(rejected.name))
        self.assertLess(names.index(rejected.name), names.index(verified.name))

    def test_verifying_sets_status_and_flips_can_receive_payouts(self):
        self.venue.bank_account_number = "123456789012"
        self.venue.bank_ifsc_code = "HDFC0001234"
        self.venue.save()
        self.assertFalse(self.venue.can_receive_payouts)

        resp = self.admin_client.post(
            reverse("admin-venue-kyc-set", args=[self.venue.slug]), {"status": "verified"})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["kyc_status"], "verified")
        self.assertTrue(resp.data["can_receive_payouts"])

    def test_rejecting_records_a_reason(self):
        resp = self.admin_client.post(
            reverse("admin-venue-kyc-set", args=[self.venue.slug]),
            {"status": "rejected", "rejection_reason": "GSTIN doesn't match business name"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["kyc_rejection_reason"], "GSTIN doesn't match business name")

    def test_invalid_status_value_is_rejected(self):
        resp = self.admin_client.post(
            reverse("admin-venue-kyc-set", args=[self.venue.slug]), {"status": "pending"})
        self.assertEqual(resp.status_code, 400)

    def test_missing_venue_404s(self):
        resp = self.admin_client.post(
            reverse("admin-venue-kyc-set", args=["no-such-venue"]), {"status": "verified"})
        self.assertEqual(resp.status_code, 404)
