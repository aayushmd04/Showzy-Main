"""Accounts that existed before the sign-up questions did.

Hosts now give a venue (name, address, city, capacity) and artists a stage name,
city, genres and bio when they sign up, but only the sign-up path asks. Anyone
who joined earlier has none of it. Nothing they do should ever be a server
error (5xx): at worst a clear 4xx that says what is missing.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.artists.models import Artist
from apps.core.models import City
from apps.events.models import Event, EventStatus
from apps.users.models import UserRole
from apps.venues.models import Venue

User = get_user_model()


class LegacyBase(TestCase):
    def setUp(self):
        self.city = City.objects.create(name="Mysuru", slug="mysuru-legacy")
        # A host who joined before venues were collected: no venue, no name.
        self.bare_host = User.objects.create_user(email="old-host@naada.test", full_name="", role=UserRole.VENUE_OWNER)
        # An artist with no artist profile row at all.
        self.bare_artist = User.objects.create_user(email="old-artist@naada.test", full_name="", role=UserRole.ARTIST)
        # An artist row from sign-up's throwaway stage name: no city, genres, photo, fee.
        thin_user = User.objects.create_user(email="thin-artist@naada.test", full_name="Thin", role=UserRole.ARTIST)
        self.thin_artist = Artist.objects.create(user=thin_user, stage_name="Thin")
        self.thin_user = thin_user
        self.fan = User.objects.create_user(email="old-fan@naada.test", full_name="", role=UserRole.ATTENDEE)
        # A host with a venue but never an organiser record.
        self.venue_host = User.objects.create_user(email="venue-host@naada.test", full_name="V Host", role=UserRole.VENUE_OWNER)
        self.venue = Venue.objects.create(owner=self.venue_host, name="Old Hall", slug="old-hall", address_line1="1 Rd", city=self.city, capacity=40)
        self.event = Event.objects.create(
            organizer=self.venue_host, venue=self.venue, title="Old night", status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=3), end_datetime=timezone.now() + timedelta(days=3, hours=3))

    def as_user(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def assert_no_server_error(self, resp, what):
        self.assertLess(resp.status_code, 500, f"{what} -> {resp.status_code}: {resp.content[:300]!r}")



class LegacyAccountsNeverGetServerErrors(LegacyBase):
    GETS = [
        "auth-me", "notifications-list", "notifications-prefs", "events-saved", "orders-mine", "tickets-mine",
        "booking-conversations", "booking-orders", "organizers-list", "artists-mine", "artists-list", "venues-list",
        "events-list", "gate-mine", "host-payout-statement", "chat-rooms", "auth-consents", "auth-me-export",
        "auth-deletion-check",
    ]

    def test_every_kind_of_old_account_can_load_every_page_it_can_reach(self):
        for user in (self.bare_host, self.bare_artist, self.thin_user, self.fan, self.venue_host):
            c = self.as_user(user)
            for name in self.GETS:
                self.assert_no_server_error(c.get(reverse(name)), f"{user.email} GET {name}")
            self.assert_no_server_error(c.get(reverse("venues-list") + "?mine=true"), f"{user.email} mine venues")
            self.assert_no_server_error(c.get(reverse("events-list") + "?mine=true"), f"{user.email} mine events")

    def test_a_host_with_no_venue_gets_a_clear_message_not_a_crash_when_creating_an_event(self):
        resp = self.as_user(self.bare_host).post(reverse("events-create"), {
            "title": "First night",
            "start_datetime": (timezone.now() + timedelta(days=5)).isoformat(),
            "end_datetime": (timezone.now() + timedelta(days=5, hours=3)).isoformat(),
        }, format="json")
        self.assertEqual(resp.status_code, 400, resp.content[:300])
        self.assertIn("venue", resp.json())

    def test_a_host_with_no_venue_can_still_make_one_with_just_what_signup_asks(self):
        resp = self.as_user(self.bare_host).post(reverse("venues-list"), {
            "name": "My Room", "address_line1": "12, 4th Main", "city": self.city.id, "capacity": 80,
        }, format="json")
        self.assertEqual(resp.status_code, 201, resp.content[:300])

    def test_an_old_host_can_publish_to_the_booking_flow_without_an_organiser_record(self):
        artist_user = User.objects.create_user(email="target-artist@naada.test", full_name="Target", role=UserRole.ARTIST)
        artist = Artist.objects.create(user=artist_user, stage_name="Target")
        c = self.as_user(self.venue_host)
        org = c.post(reverse("organizers-list"), {"name": "Old Hall"}, format="json")
        self.assertEqual(org.status_code, 201, org.content[:300])
        convo = c.post(reverse("booking-conversations"), {"organizer": org.json()["id"], "artist": str(artist.id)}, format="json")
        self.assertLess(convo.status_code, 500, convo.content[:300])

    def test_an_old_artist_with_no_profile_row_can_create_one_and_a_thin_one_can_be_edited(self):
        c = self.as_user(self.bare_artist)
        self.assertEqual(c.get(reverse("artists-mine")).status_code, 404)  # a clear "none yet"
        made = c.post(reverse("artists-list"), {"stage_name": "Fresh Start"}, format="json")
        self.assertEqual(made.status_code, 201, made.content[:300])
        thin = self.as_user(self.thin_user)
        patched = thin.patch(reverse("artists-detail", args=[self.thin_artist.id]), {"bio": "Hello"}, format="json")
        self.assertEqual(patched.status_code, 200, patched.content[:300])

    def test_a_thin_artist_still_has_a_working_public_page_and_follow_and_offers(self):
        resp = APIClient().get(reverse("artists-detail", args=[self.thin_artist.id]))
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(self.as_user(self.fan).post(reverse("artists-follow", args=[self.thin_artist.id])).status_code, 200)

    def test_a_fan_with_no_name_can_book_review_and_see_their_account(self):
        c = self.as_user(self.fan)
        self.assert_no_server_error(c.get(reverse("events-detail", args=[self.event.id])), "event page")
        self.assert_no_server_error(c.get(reverse("event-zones", args=[self.event.id])), "zones")
        self.assert_no_server_error(c.post(reverse("events-save", args=[self.event.id])), "save")

    def test_profile_update_with_a_blank_name_is_refused_clearly_or_accepted_never_a_500(self):
        c = self.as_user(self.fan)
        for body in ({"full_name": ""}, {"full_name": "Asha Rao"}, {"full_name": None}):
            self.assert_no_server_error(c.patch(reverse("auth-me"), body, format="json"), f"update {body}")


class AccountSetupStatusTests(LegacyBase):
    """The app asks old accounts for what sign-up now collects."""

    def status(self, user):
        resp = self.as_user(user).get(reverse("auth-setup"))
        self.assertEqual(resp.status_code, 200, resp.content[:300])
        return resp.json()

    def steps(self, user):
        return {s["key"]: s for s in self.status(user)["steps"]}

    def test_a_host_with_no_venue_is_told_to_add_one_and_it_blocks(self):
        data = self.status(self.bare_host)
        self.assertFalse(data["complete"])
        self.assertTrue(data["needs_attention"])
        venue = self.steps(self.bare_host)["venue"]
        self.assertTrue(venue["blocking"])
        self.assertIn("address", venue["label"])
        self.assertIn("name", self.steps(self.bare_host))

    def test_a_host_with_a_venue_and_a_name_is_complete(self):
        self.assertTrue(self.status(self.venue_host)["complete"])

    def test_adding_the_venue_clears_the_step(self):
        self.as_user(self.bare_host).post(reverse("venues-list"), {
            "name": "My Room", "address_line1": "12, 4th Main", "city": self.city.id, "capacity": 80}, format="json")
        self.assertNotIn("venue", self.steps(self.bare_host))

    def test_a_venue_with_no_capacity_is_a_gentle_nudge_not_a_block(self):
        Venue.objects.filter(pk=self.venue.pk).update(capacity=0)
        step = self.steps(self.venue_host)["venue_capacity"]
        self.assertFalse(step["blocking"])
        self.assertFalse(self.status(self.venue_host)["needs_attention"])

    def test_an_artist_with_no_profile_row_is_blocked_until_they_make_one(self):
        self.assertTrue(self.steps(self.bare_artist)["artist"]["blocking"])

    def test_a_thin_artist_is_asked_for_city_and_genres_and_bio_first(self):
        steps = self.steps(self.thin_user)
        self.assertTrue(steps["artist"]["blocking"])  # no city or genres: hosts can't find them
        for word in ("city", "genres", "bio"):
            self.assertIn(word, steps["artist"]["label"])
        self.assertIn("photo", steps["artist_profile"]["label"])
        self.assertFalse(steps["artist_profile"]["blocking"])

    def test_a_fan_is_only_ever_asked_for_a_name_and_never_blocked(self):
        data = self.status(self.fan)
        self.assertEqual([s["key"] for s in data["steps"]], ["name"])
        self.assertFalse(data["needs_attention"])

    def test_it_needs_a_signed_in_user(self):
        self.assertIn(APIClient().get(reverse("auth-setup")).status_code, (401, 403))

    def test_the_event_error_for_a_host_with_no_venue_says_what_to_do(self):
        resp = self.as_user(self.bare_host).post(reverse("events-create"), {
            "title": "First night",
            "start_datetime": (timezone.now() + timedelta(days=5)).isoformat(),
            "end_datetime": (timezone.now() + timedelta(days=5, hours=3)).isoformat(),
        }, format="json")
        self.assertIn("Add your venue first", resp.json()["venue"][0])
