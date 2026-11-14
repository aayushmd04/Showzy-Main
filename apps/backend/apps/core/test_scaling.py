"""The public pages are what a crowd hits, so they must stay cheap and must never mix viewers up."""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.artists.models import Artist, ArtistPhoto
from apps.core import public_cache
from apps.core.models import City, Genre
from apps.events.models import Event, EventSave, EventStatus
from apps.tickets.models import TicketTier
from apps.users.models import UserRole
from apps.venues.models import Venue, VenuePhoto

User = get_user_model()


def seed(n_events=12):
    owner = User.objects.create_user(email="scale-owner@naada.test", full_name="Owner", role=UserRole.VENUE_OWNER)
    city = City.objects.create(name="Mysuru", slug="mysuru-scale")
    venue = Venue.objects.create(owner=owner, name="Hall", slug="hall-scale", address_line1="1 Rd", city=city, capacity=50)
    VenuePhoto.objects.create(venue=venue, image="venues/a.jpg", is_primary=True)
    genre = Genre.objects.create(name="Improv", slug="improv-scale")
    events = []
    for i in range(n_events):
        e = Event.objects.create(
            organizer=owner, venue=venue, title=f"Night {i}", status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=i + 1), end_datetime=timezone.now() + timedelta(days=i + 1, hours=3))
        e.genres.add(genre)
        TicketTier.objects.create(event=e, name="GA", price=Decimal("200"), total_quantity=50, sold_quantity=5)
        TicketTier.objects.create(event=e, name="VIP", price=Decimal("500"), total_quantity=10)
        events.append(e)
    for i in range(n_events):
        u = User.objects.create_user(email=f"scale-artist{i}@naada.test", full_name=f"Artist {i}", role=UserRole.ARTIST)
        a = Artist.objects.create(user=u, stage_name=f"Artist {i}", city=city)
        a.genres.add(genre)
        ArtistPhoto.objects.create(artist=a, image=f"artists/{i}.jpg", is_primary=True)
    return owner, events


class QueryCountTests(TestCase):
    """A page of results costs a fixed handful of queries, however many rows are on it."""

    def count(self, url, user=None):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext

        c = APIClient()
        if user:
            c.force_authenticate(user=user)
        with CaptureQueriesContext(connection) as q:
            resp = c.get(url)
        self.assertEqual(resp.status_code, 200)
        return len(q), resp

    def test_twenty_events_cost_the_same_queries_as_two(self):
        owner, events = seed(20)
        # Two on the page vs twenty: same count means no per-row queries.
        small, _ = self.count(reverse("events-list") + "?page_size=2")
        full, resp = self.count(reverse("events-list"))
        self.assertEqual(len(resp.data["results"]), 20)
        self.assertEqual(small, full)
        self.assertLessEqual(full, 8)

    def test_a_signed_in_events_list_adds_one_query_for_saved_events_not_one_per_row(self):
        owner, events = seed(20)
        fan = User.objects.create_user(email="scale-fan@naada.test", full_name="Fan")
        EventSave.objects.create(user=fan, event=events[0])
        anon, _ = self.count(reverse("events-list"))
        authed, resp = self.count(reverse("events-list"), user=fan)
        self.assertLessEqual(authed - anon, 2)
        saved = [e["is_saved"] for e in resp.data["results"]]
        self.assertEqual(sum(saved), 1)

    def test_the_artists_list_does_not_query_per_artist(self):
        seed(16)
        small, _ = self.count(reverse("artists-list") + "?page_size=2")
        full, resp = self.count(reverse("artists-list"))
        self.assertGreaterEqual(len(resp.data["results"]), 16)
        self.assertEqual(small, full)
        self.assertLessEqual(full, 8)

    def test_the_venues_list_does_not_query_per_venue(self):
        owner, _ = seed(1)
        city = City.objects.first()
        for i in range(8):
            v = Venue.objects.create(owner=owner, name=f"V{i}", slug=f"v{i}-scale", address_line1="x", city=city, capacity=10)
            VenuePhoto.objects.create(venue=v, image=f"venues/{i}.jpg", is_primary=True)
        small, _ = self.count(reverse("venues-list") + "?page_size=2")
        full, _ = self.count(reverse("venues-list"))
        self.assertEqual(small, full)

    def test_what_the_list_says_is_unchanged(self):
        owner, events = seed(1)
        row = APIClient().get(reverse("events-list")).data["results"][0]
        self.assertEqual(row["min_price"], 200.0)
        self.assertEqual(row["seats_left"], 45 + 10)
        self.assertFalse(row["is_saved"])

    def test_a_client_can_ask_for_a_bigger_page_but_not_an_unbounded_one(self):
        seed(25)
        c = APIClient()
        self.assertEqual(len(c.get(reverse("events-list") + "?page_size=100").data["results"]), 25)
        self.assertEqual(len(c.get(reverse("events-list")).data["results"]), 20)
        self.assertLessEqual(len(c.get(reverse("events-list") + "?page_size=100000").data["results"]), 100)


@override_settings(PUBLIC_READ_CACHE_TTL=30)
class PublicReadCacheTests(TestCase):
    def setUp(self):
        public_cache.clear()
        self.owner, self.events = seed(3)
        self.artist = Artist.objects.first()

    def tearDown(self):
        public_cache.clear()

    def get(self, url, token=None, **extra):
        c = APIClient()
        if token:
            c.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return c.get(url, **extra)

    def test_a_repeat_anonymous_read_is_answered_from_memory(self):
        url = reverse("events-list")
        first = self.get(url)
        self.assertEqual(first["X-Cache"], "MISS")
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        with CaptureQueriesContext(connection) as q:
            second = self.get(url)
        self.assertEqual(second["X-Cache"], "HIT")
        self.assertEqual(len(q), 0)
        self.assertEqual(second.content, first.content)
        self.assertIn("max-age=30", second["Cache-Control"])
        self.assertIn("public", second["Cache-Control"])

    def test_a_signed_in_request_never_enters_or_leaves_the_cache(self):
        url = reverse("artists-detail", args=[self.artist.id])
        host = User.objects.create_user(email="scale-host@naada.test", full_name="Host", role=UserRole.VENUE_OWNER)
        Artist.objects.filter(pk=self.artist.pk).update(booking_fee_min=Decimal("4000"), booking_fee_max=Decimal("9000"))
        self.get(url)  # an anonymous visitor primes the cache with the public version
        from rest_framework_simplejwt.tokens import AccessToken
        token = str(AccessToken.for_user(host))
        resp = self.get(url, token=token)
        self.assertNotIn("X-Cache", resp)
        self.assertEqual(resp.json()["fee_range_min"], "4000.00")  # the host still sees the fee
        # ...and the anonymous answer was not polluted by it.
        anon = self.get(url)
        self.assertNotIn("fee_range_min", anon.json())

    def test_a_session_cookie_also_bypasses_the_cache(self):
        c = APIClient()
        c.cookies["sessionid"] = "abc"
        self.assertNotIn("X-Cache", c.get(reverse("events-list")))

    def test_only_the_public_reads_are_cached(self):
        for url in (
            reverse("event-attendees", args=[self.events[0].id]),
            reverse("health"),
        ):
            self.assertNotIn("X-Cache", self.get(url), url)

    def test_the_hosts_own_list_is_never_served_from_the_public_cache(self):
        self.get(reverse("events-list"))
        self.assertNotIn("X-Cache", self.get(reverse("events-list") + "?mine=true"))

    def test_different_pages_and_filters_are_cached_separately(self):
        a = self.get(reverse("events-list") + "?page_size=1")
        b = self.get(reverse("events-list") + "?page_size=2")
        self.assertNotEqual(len(a.json()["results"]), len(b.json()["results"]))

    def test_errors_are_not_cached(self):
        url = reverse("artists-detail", args=["00000000-0000-0000-0000-000000000000"])
        self.assertEqual(self.get(url).status_code, 404)
        self.assertNotIn("X-Cache", self.get(url))

    def test_writes_are_not_cached(self):
        resp = APIClient().post(reverse("events-list"), {}, format="json")
        self.assertNotIn("X-Cache", resp)

    def test_a_new_event_appears_after_the_short_ttl(self):
        url = reverse("events-list")
        before = self.get(url).json()["count"]
        Event.objects.create(
            organizer=self.owner, venue=Venue.objects.first(), title="Late addition", status=EventStatus.PUBLISHED,
            start_datetime=timezone.now() + timedelta(days=9), end_datetime=timezone.now() + timedelta(days=9, hours=2))
        self.assertEqual(self.get(url).json()["count"], before)  # still the cached answer
        public_cache.clear()  # what the TTL does
        self.assertEqual(self.get(url).json()["count"], before + 1)


class PublicReadCacheIsOffByDefaultInTests(TestCase):
    def test_the_suite_runs_without_the_cache(self):
        owner, _ = seed(1)
        self.assertNotIn("X-Cache", APIClient().get(reverse("events-list")))


@override_settings(PUBLIC_READ_CACHE_TTL=30)
class EventViewRecordingTests(TestCase):
    def setUp(self):
        public_cache.clear()
        from apps.events import analytics
        analytics.reset()
        self.owner, self.events = seed(1)
        self.url = reverse("events-detail", args=[self.events[0].id])

    def tearDown(self):
        public_cache.clear()

    def views(self):
        from apps.events.models import EventView
        return EventView.objects.filter(event=self.events[0]).count()

    def test_a_viewer_is_counted_once_however_often_they_refresh(self):
        c = APIClient()
        for _ in range(5):
            self.assertEqual(c.get(self.url).status_code, 200)
        self.assertEqual(self.views(), 1)

    def test_a_different_viewer_is_counted_too_including_when_the_page_is_served_from_memory(self):
        APIClient().get(self.url, REMOTE_ADDR="10.0.0.1")
        resp = APIClient().get(self.url, REMOTE_ADDR="10.0.0.2")
        self.assertEqual(resp["X-Cache"], "HIT")
        self.assertEqual(self.views(), 2)

    def test_the_event_page_is_served_from_memory_on_a_repeat(self):
        APIClient().get(self.url)
        self.assertEqual(APIClient().get(self.url, REMOTE_ADDR="10.0.0.9")["X-Cache"], "HIT")

    def test_a_draft_is_still_hidden_from_the_public(self):
        Event.objects.filter(pk=self.events[0].pk).update(status=EventStatus.DRAFT)
        self.assertEqual(APIClient().get(self.url).status_code, 404)
