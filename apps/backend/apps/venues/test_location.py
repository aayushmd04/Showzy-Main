"""Where a venue is: who can set its address and Google Maps link, what is accepted, and what guests are shown."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import City
from apps.events.models import Event, EventStatus
from .models import Venue

User = get_user_model()


class VenueLocationTests(TestCase):
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

    def test_an_owner_can_set_a_maps_link_and_guests_can_read_it(self):
        resp = self.patch({"google_maps_url": "maps.app.goo.gl/abc123"})
        self.assertEqual(resp.status_code, 200, resp.data)
        public = APIClient().get(self.url).data
        # The https:// people leave off is added for them.
        self.assertEqual(public["google_maps_url"], "https://maps.app.goo.gl/abc123")
        self.assertEqual(public["address_line1"], "12, 4th Main")

    def test_a_maps_link_must_be_http_or_https(self):
        for bad in ("javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://x.in/map"):
            self.assertEqual(self.patch({"google_maps_url": bad}).status_code, 400, bad)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.google_maps_url, "")

    def test_only_the_owner_can_change_it(self):
        other = APIClient()
        other.force_authenticate(user=self.other)
        self.assertEqual(self.patch({"google_maps_url": "https://x.in"}, client=other).status_code, 403)
        self.assertEqual(self.patch({"google_maps_url": "https://x.in"}, client=APIClient()).status_code, 401)
        self.venue.refresh_from_db()
        self.assertEqual(self.venue.google_maps_url, "")

    def test_an_events_venue_carries_the_address_and_link_for_directions(self):
        self.patch({"google_maps_url": "https://maps.app.goo.gl/x"})
        event = Event.objects.create(
            organizer=self.owner, venue=self.venue, title="Directed night", status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=3),
            end_datetime=timezone.now() + timedelta(days=3, hours=3))
        venue = APIClient().get(reverse("events-detail", args=[event.id])).data["venue"]
        self.assertEqual(venue["address_line1"], "12, 4th Main")
        self.assertEqual(venue["google_maps_url"], "https://maps.app.goo.gl/x")
        self.assertEqual(venue["city_name"], "Mysuru")
        # Payout details are never part of this shape.
        self.assertNotIn("bank_account_last4", venue)
        self.assertNotIn("gst_number", venue)
