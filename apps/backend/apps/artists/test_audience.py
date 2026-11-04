"""What an artist's public profile shows to whom.

Fees and availability are for the people hiring; gig history is for people in
the scene; contact details are for the artist; nothing private leaks to the
audience, to a signed-out visitor, or to another artist.
"""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.users.models import UserRole
from .models import Artist

User = get_user_model()

HOST_ONLY = ["fee_range_min", "fee_range_max", "booking_fee_min", "booking_fee_max", "availability"]
OWNER_ONLY = ["booking_email", "booking_phone", "booking_notes", "bank_account_last4", "profile_gaps"]


class ArtistAudienceTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="owner@naada.test", full_name="Owner Artist", role=UserRole.ARTIST)
        self.rival = User.objects.create_user(email="rival@naada.test", full_name="Rival Artist", role=UserRole.ARTIST)
        self.host = User.objects.create_user(email="host@naada.test", full_name="Venue Host", role=UserRole.VENUE_OWNER)
        self.fan = User.objects.create_user(email="fan@naada.test", full_name="Fan", role=UserRole.ATTENDEE)
        self.admin = User.objects.create_user(email="admin@naada.test", full_name="Ops", role=UserRole.ADMIN, is_staff=True)
        self.artist = Artist.objects.create(
            user=self.owner, stage_name="Divya Nair", booking_fee_min=Decimal("4000"), booking_fee_max=Decimal("15000"),
            booking_email="divya-bookings@example.com", booking_phone="+919845011223",
            availability={"blackout_dates": ["2026-12-01"], "notes": "Away in December"},
            bank_account_number="123456789012", bank_ifsc_code="HDFC0001234",
        )

    def client_for(self, user=None):
        c = APIClient()
        if user:
            c.force_authenticate(user=user)
        return c

    def detail(self, user=None):
        resp = self.client_for(user).get(reverse("artists-detail", args=[self.artist.id]))
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data

    def listing(self, user=None):
        resp = self.client_for(user).get(reverse("artists-list"))
        self.assertEqual(resp.status_code, 200)
        return next(a for a in resp.data["results"] if a["stage_name"] == "Divya Nair")

    def test_a_signed_out_visitor_sees_only_the_public_profile(self):
        for data in (self.detail(), self.listing()):
            for key in HOST_ONLY + OWNER_ONLY + ["total_gigs"]:
                self.assertNotIn(key, data, key)
            self.assertNotIn("email", data["user"])
            self.assertEqual(data["stage_name"], "Divya Nair")

    def test_an_audience_member_sees_no_more_than_a_stranger(self):
        for data in (self.detail(self.fan), self.listing(self.fan)):
            for key in HOST_ONLY + OWNER_ONLY + ["total_gigs"]:
                self.assertNotIn(key, data, key)

    def test_another_artist_cannot_read_a_rivals_fees_or_calendar(self):
        for data in (self.detail(self.rival), self.listing(self.rival)):
            for key in HOST_ONLY + OWNER_ONLY:
                self.assertNotIn(key, data, key)
            self.assertNotIn("email", data["user"])
        # ...though gig history is open to people in the scene.
        self.assertIn("total_gigs", self.detail(self.rival))

    def test_a_host_sees_fees_availability_and_gigs_but_not_contact_details(self):
        for data in (self.detail(self.host), self.listing(self.host)):
            self.assertEqual(data["fee_range_min"], "4000.00")
            self.assertEqual(data["fee_range_max"], "15000.00")
            self.assertIn("total_gigs", data)
            for key in OWNER_ONLY:
                self.assertNotIn(key, data, key)
            self.assertNotIn("email", data["user"])
        self.assertEqual(self.detail(self.host)["availability"]["blackout_dates"], ["2026-12-01"])

    def test_the_artist_sees_their_own_everything(self):
        data = self.detail(self.owner)
        for key in HOST_ONLY + OWNER_ONLY + ["total_gigs"]:
            self.assertIn(key, data, key)
        self.assertEqual(data["booking_email"], "divya-bookings@example.com")
        self.assertEqual(data["user"]["email"], "owner@naada.test")
        self.assertEqual(data["bank_account_last4"], "9012")

    def test_staff_see_everything(self):
        data = self.detail(self.admin)
        for key in HOST_ONLY + OWNER_ONLY:
            self.assertIn(key, data, key)

    def test_the_private_values_never_appear_anywhere_in_a_public_response(self):
        body = str(self.detail()) + str(self.client_for().get(reverse("artists-list")).data)
        for secret in ("divya-bookings@example.com", "+919845011223", "4000", "15000", "Away in December", "9012", "owner@naada.test"):
            self.assertNotIn(secret, body, secret)
