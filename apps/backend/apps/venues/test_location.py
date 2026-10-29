"""A venue's pin on the map: who can set it, what is accepted, and what guests are shown."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core.models import City
from .models import Venue

User = get_user_model()


class LocationTestBase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="loc-host@naada.test", full_name="Loc Host")
        self.other = User.objects.create_user(email="loc-other@naada.test", full_name="Other Host")
        city = City.objects.create(name="Mysuru", slug="mysuru-loc")
        self.venue = Venue.objects.create(
            owner=self.owner, name="Pin Hall", slug="pin-hall",
            address_line1="12, 4th Main", city=city, capacity=80)
        self.url = reverse("venues-detail", args=[self.venue.slug])
        self.client = APIClient()
        self.client.force_authenticate(user=self.owner)

    def patch(self, body, client=None):
        return (client or self.client).patch(self.url, body, format="json")



class VenueLocationTests(LocationTestBase):
    def test_an_owner_can_set_the_pin_and_a_maps_link_and_guests_can_read_them(self):
        resp = self.patch({
            "lat": "12.295800", "lng": "76.639400",
            "google_maps_url": "maps.app.goo.gl/abc123",
        })
        self.assertEqual(resp.status_code, 200, resp.data)

        public = APIClient().get(self.url).data
        self.assertEqual(public["lat"], "12.295800")
        self.assertEqual(public["lng"], "76.639400")
        self.assertEqual(public["google_maps_url"], "https://maps.app.goo.gl/abc123")
        self.assertEqual(public["address_line1"], "12, 4th Main")

    def test_a_latitude_or_longitude_off_the_planet_is_refused(self):
        self.assertEqual(self.patch({"lat": "91", "lng": "76.6"}).status_code, 400)
        self.assertEqual(self.patch({"lat": "-91", "lng": "76.6"}).status_code, 400)
        self.assertEqual(self.patch({"lat": "12.3", "lng": "181"}).status_code, 400)
        self.venue.refresh_from_db()
        self.assertIsNone(self.venue.lat)

    def test_half_a_pin_is_refused(self):
        resp = self.patch({"lat": "12.3"})
        self.assertEqual(resp.status_code, 400)
        self.assertIn("lng", resp.data)
        self.venue.refresh_from_db()
        self.assertIsNone(self.venue.lat)

    def test_the_pin_can_be_cleared(self):
        self.patch({"lat": "12.3", "lng": "76.6"})
        resp = self.patch({"lat": None, "lng": None})
        self.assertEqual(resp.status_code, 200, resp.data)
        self.venue.refresh_from_db()
        self.assertIsNone(self.venue.lat)
        self.assertIsNone(self.venue.lng)

    def test_a_maps_link_must_be_http_or_https(self):
        for bad in ("javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://x.in/map"):
            self.assertEqual(self.patch({"google_maps_url": bad}).status_code, 400, bad)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.google_maps_url, "")

    def test_only_the_owner_can_move_the_pin(self):
        other = APIClient()
        other.force_authenticate(user=self.other)
        self.assertEqual(self.patch({"lat": "1", "lng": "1"}, client=other).status_code, 403)
        self.assertEqual(self.patch({"lat": "1", "lng": "1"}, client=APIClient()).status_code, 401)
        self.venue.refresh_from_db()
        self.assertIsNone(self.venue.lat)


class EventPageVenueTests(LocationTestBase):
    """The event page's venue is the list-shaped serializer; it must carry the pin too."""

    def test_an_events_venue_carries_the_address_and_pin_for_the_map(self):
        from datetime import timedelta
        from django.utils import timezone
        from apps.events.models import Event, EventStatus

        self.patch({"lat": "12.2958", "lng": "76.6394", "google_maps_url": "https://maps.app.goo.gl/x"})
        event = Event.objects.create(
            organizer=self.owner, venue=self.venue, title="Pinned night", status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=3),
            end_datetime=timezone.now() + timedelta(days=3, hours=3))
        venue = APIClient().get(reverse("events-detail", args=[event.id])).data["venue"]
        self.assertEqual(venue["address_line1"], "12, 4th Main")
        self.assertEqual(venue["google_maps_url"], "https://maps.app.goo.gl/x")
        self.assertEqual(float(venue["lat"]), 12.2958)
        self.assertEqual(venue["city_name"], "Mysuru")
        # Payout details are never part of this shape.
        self.assertNotIn("bank_account_last4", venue)
        self.assertNotIn("gst_number", venue)
