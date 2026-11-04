"""A venue's public page: its nights, what people said, who follows — and nothing private."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import City, Genre
from apps.events.models import Event, EventReview, EventStatus
from apps.users.models import UserRole
from .models import Venue

User = get_user_model()

PRIVATE = ["contact_email", "contact_phone", "owner_name", "owner", "layout"]


class VenuePublicPageTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(email="vowner@naada.test", full_name="Venue Owner", role=UserRole.VENUE_OWNER)
        self.fan = User.objects.create_user(email="vfan@naada.test", full_name="Fan One")
        self.fan2 = User.objects.create_user(email="vfan2@naada.test", full_name="Fan Two")
        city = City.objects.create(name="Mysuru", slug="mysuru-pub")
        self.venue = Venue.objects.create(
            owner=self.owner, name="Gokulam Hall", slug="gokulam-hall", address_line1="12, 4th Main",
            city=city, capacity=120, contact_email="hall@example.com", contact_phone="+919845011223",
            layout={"version": 1, "elements": [{"id": "a", "type": "stage"}]},
        )
        self.improv = Genre.objects.create(name="Improv", slug="improv-pub")
        now = timezone.now()
        self.upcoming = self.make_event("Improv Night", now + timedelta(days=5), EventStatus.PUBLISHED)
        self.past = self.make_event("Last Month's Jam", now - timedelta(days=30), EventStatus.PAST)
        self.draft = self.make_event("Secret Draft", now + timedelta(days=9), EventStatus.DRAFT)
        self.url = reverse("venues-detail", args=[self.venue.slug])

    def make_event(self, title, start, status):
        e = Event.objects.create(
            organizer=self.owner, venue=self.venue, title=title, status=status,
            start_datetime=start, end_datetime=start + timedelta(hours=3))
        e.genres.add(self.improv)
        return e

    def client_for(self, user=None):
        c = APIClient()
        if user:
            c.force_authenticate(user=user)
        return c

    def test_the_public_page_hides_contact_details_ownership_and_the_floor_plan(self):
        for viewer in (None, self.fan):
            data = self.client_for(viewer).get(self.url).data
            for key in PRIVATE:
                self.assertNotIn(key, data, key)
            self.assertEqual(data["name"], "Gokulam Hall")
            self.assertEqual(data["address_line1"], "12, 4th Main")
        body = str(self.client_for().get(self.url).data)
        for secret in ("hall@example.com", "+919845011223", "vowner@naada.test"):
            self.assertNotIn(secret, body)

    def test_the_owner_still_sees_all_of_it(self):
        data = self.client_for(self.owner).get(self.url).data
        for key in ("contact_email", "contact_phone", "layout"):
            self.assertIn(key, data, key)

    def test_the_public_list_hides_the_floor_plan_but_the_owners_own_list_has_it(self):
        listing = self.client_for().get(reverse("venues-list")).data["results"][0]
        self.assertNotIn("layout", listing)
        mine = self.client_for(self.owner).get(reverse("venues-list") + "?mine=true").data
        rows = mine["results"] if isinstance(mine, dict) else mine
        self.assertIn("layout", rows[0])

    def test_it_lists_upcoming_and_past_nights_but_never_a_draft(self):
        data = self.client_for().get(self.url).data
        self.assertEqual([e["title"] for e in data["upcoming_events"]], ["Improv Night"])
        self.assertEqual([e["title"] for e in data["past_events"]], ["Last Month's Jam"])
        self.assertEqual(data["upcoming_events"][0]["genres"], ["Improv"])
        self.assertNotIn("Secret Draft", str(data))

    def test_it_summarises_what_attendees_said(self):
        self.assertIsNone(self.client_for().get(self.url).data["avg_rating"])
        EventReview.objects.create(event=self.past, reviewer=self.fan, rating=5, comment="Brilliant room")
        EventReview.objects.create(event=self.past, reviewer=self.fan2, rating=4, comment="Good sound")
        EventReview.objects.create(event=self.past, reviewer=self.owner, rating=1, comment="hidden", is_published=False)
        data = self.client_for().get(self.url).data
        self.assertEqual(data["avg_rating"], 4.5)
        self.assertEqual(data["review_count"], 2)
        self.assertEqual({r["comment"] for r in data["recent_reviews"]}, {"Brilliant room", "Good sound"})
        self.assertNotIn("email", str(data["recent_reviews"]))

    def test_following_a_venue_is_one_tap_each_way_and_counted(self):
        url = reverse("venues-follow", args=[self.venue.slug])
        fan = self.client_for(self.fan)
        self.assertEqual(fan.post(url).data, {"following": True, "follower_count": 1})
        self.assertEqual(fan.post(url).data["follower_count"], 1)  # idempotent
        self.assertEqual(self.client_for(self.fan2).post(url).data["follower_count"], 2)

        detail = fan.get(self.url).data
        self.assertTrue(detail["is_following"])
        self.assertEqual(detail["follower_count"], 2)
        self.assertFalse(self.client_for().get(self.url).data["is_following"])

        self.assertEqual(fan.delete(url).data, {"following": False, "follower_count": 1})
        self.assertFalse(fan.get(self.url).data["is_following"])

    def test_following_needs_an_account_and_a_real_venue(self):
        url = reverse("venues-follow", args=[self.venue.slug])
        self.assertIn(self.client_for().post(url).status_code, (401, 403))
        self.assertEqual(self.client_for(self.fan).post(reverse("venues-follow", args=["nope"])).status_code, 404)
