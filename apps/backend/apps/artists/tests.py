"""Tests for artist GST/PAN/KYC/bank-details.

These fields didn't exist at all before — no DB columns, no serializer
exposure, nothing. The frontend's "Add bank" button just flipped a local
boolean with no form and no API call. These tests pin: the bank account
number is never returned in full over the API, a still-pending KYC moves to
"submitted" the moment there's real payout info to review, format
validation catches obvious typos without being pedantic, and only an admin
can ever move KYC to verified/rejected.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from apps.core.models import KYCStatus
from .models import Artist

User = get_user_model()


class ArtistPayoutTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="payout-artist@naada.test", full_name="Payout Artist")
        self.artist = Artist.objects.create(user=self.user, stage_name="Payout Artist Live")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

        self.admin = User.objects.create_user(
            email="payout-admin@naada.test", full_name="Ops Admin", is_staff=True, role="admin")
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(user=self.admin)


class BankDetailsMaskingTests(ArtistPayoutTestCase):
    def test_full_account_number_is_never_returned(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_account_number": "123456789012", "bank_ifsc_code": "HDFC0001234",
             "bank_account_holder_name": "Payout Artist"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertNotIn("bank_account_number", resp.data)
        self.assertEqual(resp.data["bank_account_last4"], "9012")

        # And a plain GET afterwards still never carries it.
        get_resp = self.client.get(reverse("artists-detail", args=[self.artist.id]))
        self.assertNotIn("bank_account_number", get_resp.data)
        self.assertEqual(get_resp.data["bank_account_last4"], "9012")

    def test_account_number_is_actually_persisted_server_side(self):
        self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_account_number": "999988887777", "bank_ifsc_code": "SBIN0005678"},
            format="json",
        )
        self.artist.refresh_from_db()
        self.assertEqual(self.artist.bank_account_number, "999988887777")

    def test_no_bank_details_means_has_bank_details_is_false(self):
        resp = self.client.get(reverse("artists-detail", args=[self.artist.id]))
        self.assertFalse(resp.data["has_bank_details"])
        self.assertEqual(resp.data["bank_account_last4"], "")


class KycAutoSubmitTests(ArtistPayoutTestCase):
    def test_saving_bank_details_moves_pending_kyc_to_submitted(self):
        self.assertEqual(self.artist.kyc_status, KYCStatus.PENDING)
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_account_number": "123456789012", "bank_ifsc_code": "HDFC0001234"},
            format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "submitted")
        self.artist.refresh_from_db()
        self.assertEqual(self.artist.kyc_status, KYCStatus.SUBMITTED)
        self.assertIsNotNone(self.artist.kyc_submitted_at)

    def test_saving_gst_alone_also_submits_for_review(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"gst_number": "29ABCDE1234F1Z5"}, format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "submitted")

    def test_unrelated_field_edit_does_not_trigger_submission(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bio": "Just an ordinary update."}, format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "pending")

    def test_already_verified_artist_editing_bank_details_stays_verified(self):
        self.artist.kyc_status = KYCStatus.VERIFIED
        self.artist.save(update_fields=["kyc_status"])
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_account_number": "111122223333", "bank_ifsc_code": "ICIC0001111"},
            format="json",
        )
        self.assertEqual(resp.data["kyc_status"], "verified")

    def test_artist_cannot_self_verify_kyc(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"kyc_status": "verified"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.artist.refresh_from_db()
        self.assertEqual(self.artist.kyc_status, KYCStatus.PENDING)


class FormatValidationTests(ArtistPayoutTestCase):
    def test_valid_gstin_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"gst_number": "29abcde1234f1z5"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["gst_number"], "29ABCDE1234F1Z5")

    def test_malformed_gstin_is_rejected(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"gst_number": "not-a-gstin"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_pan_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"pan_number": "abcde1234f"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["pan_number"], "ABCDE1234F")

    def test_malformed_pan_is_rejected(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"pan_number": "12345"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_valid_ifsc_is_accepted_and_normalised(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_ifsc_code": "hdfc0001234"}, format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["bank_ifsc_code"], "HDFC0001234")

    def test_malformed_ifsc_is_rejected(self):
        resp = self.client.patch(
            reverse("artists-detail", args=[self.artist.id]),
            {"bank_ifsc_code": "12345"}, format="json",
        )
        self.assertEqual(resp.status_code, 400)


class AdminArtistKycTests(ArtistPayoutTestCase):
    def test_non_admin_cannot_reach_kyc_queue(self):
        resp = self.client.get(reverse("admin-artist-kyc-queue"))
        self.assertEqual(resp.status_code, 403)

    def test_non_admin_cannot_set_kyc(self):
        resp = self.client.post(
            reverse("admin-artist-kyc-set", args=[self.artist.id]), {"status": "verified"})
        self.assertEqual(resp.status_code, 403)

    def test_queue_orders_submitted_before_pending_before_rejected(self):
        submitted = Artist.objects.create(stage_name="Submitted Act", kyc_status=KYCStatus.SUBMITTED)
        rejected = Artist.objects.create(stage_name="Rejected Act", kyc_status=KYCStatus.REJECTED)
        verified = Artist.objects.create(stage_name="Verified Act", kyc_status=KYCStatus.VERIFIED)

        resp = self.admin_client.get(reverse("admin-artist-kyc-queue"))
        names = [row["stage_name"] for row in resp.data]
        self.assertLess(names.index(submitted.stage_name), names.index(self.artist.stage_name))
        self.assertLess(names.index(self.artist.stage_name), names.index(rejected.stage_name))
        self.assertLess(names.index(rejected.stage_name), names.index(verified.stage_name))

    def test_verifying_sets_status_and_flips_can_receive_payouts(self):
        self.artist.bank_account_number = "123456789012"
        self.artist.bank_ifsc_code = "HDFC0001234"
        self.artist.save()
        self.assertFalse(self.artist.can_receive_payouts)

        resp = self.admin_client.post(
            reverse("admin-artist-kyc-set", args=[self.artist.id]), {"status": "verified"})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["kyc_status"], "verified")
        self.assertTrue(resp.data["can_receive_payouts"])

    def test_rejecting_records_a_reason(self):
        resp = self.admin_client.post(
            reverse("admin-artist-kyc-set", args=[self.artist.id]),
            {"status": "rejected", "rejection_reason": "PAN doesn't match name on file"},
        )
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["kyc_rejection_reason"], "PAN doesn't match name on file")

    def test_invalid_status_value_is_rejected(self):
        resp = self.admin_client.post(
            reverse("admin-artist-kyc-set", args=[self.artist.id]), {"status": "pending"})
        self.assertEqual(resp.status_code, 400)

    def test_missing_artist_404s(self):
        import uuid
        resp = self.admin_client.post(
            reverse("admin-artist-kyc-set", args=[uuid.uuid4()]), {"status": "verified"})
        self.assertEqual(resp.status_code, 404)
