"""The sitemap crawlers read: public pages only, on the public site's domain."""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.artists.models import Artist
from apps.core.models import City, Genre
from apps.events.models import Event, EventStatus
from apps.users.models import UserRole
from apps.venues.models import Venue

User = get_user_model()
URL = "/api/v1/sitemap.xml"


@override_settings(FRONTEND_URL="https://showzy.in")
class SitemapTests(TestCase):
    def setUp(self):
        city = City.objects.create(name="Mysuru", slug="mysuru-sm")
        host = User.objects.create_user(email="h@sm.test", full_name="H", role=UserRole.VENUE_OWNER)
        self.venue = Venue.objects.create(owner=host, name="Hall", slug="the-hall", address_line1="1 Rd", city=city, capacity=40)
        now = timezone.now()

        def event(title, status, days):
            return Event.objects.create(
                organizer=host, venue=self.venue, title=title, status=status,
                start_datetime=now + timedelta(days=days), end_datetime=now + timedelta(days=days, hours=2))

        self.live = event("Live", EventStatus.PUBLISHED, 3)
        self.draft = event("Draft", EventStatus.DRAFT, 4)
        self.ancient = event("Ancient", EventStatus.PAST, -400)
        self.recent = event("Recent", EventStatus.PAST, -10)
        artist_user = User.objects.create_user(email="a@sm.test", full_name="A", role=UserRole.ARTIST)
        self.artist = Artist.objects.create(user=artist_user, stage_name="Aria")
        hidden_user = User.objects.create_user(email="x@sm.test", full_name="X", role=UserRole.ARTIST)
        self.hidden = Artist.objects.create(user=hidden_user, stage_name="Gone", is_active=False)
        Genre.objects.create(name="Jazz & Blues", slug="jazz-blues")

    def body(self):
        resp = self.client.get(URL)
        self.assertEqual(resp.status_code, 200)
        self.assertIn("xml", resp["Content-Type"])
        return resp.content.decode()

    def test_every_url_is_on_the_public_site_never_localhost_or_the_api(self):
        body = self.body()
        self.assertNotIn("localhost", body)
        self.assertNotIn("onrender", body)
        self.assertIn("<loc>https://showzy.in/</loc>", body)

    def test_lists_events_artists_venues_and_art_forms(self):
        body = self.body()
        self.assertIn(f"https://showzy.in/e/{self.live.id}", body)
        self.assertIn(f"https://showzy.in/e/{self.recent.id}", body)
        self.assertIn(f"https://showzy.in/a/{self.artist.id}", body)
        self.assertIn("https://showzy.in/v/the-hall", body)
        self.assertIn("https://showzy.in/explore?category=music", body)

    def test_genre_names_are_url_encoded_and_xml_escaped(self):
        body = self.body()
        self.assertIn("/explore?genre=Jazz%20%26%20Blues", body)
        self.assertNotIn("& Blues", body)

    def test_leaves_out_drafts_old_gigs_and_hidden_artists(self):
        body = self.body()
        self.assertNotIn(f"/e/{self.draft.id}", body)
        self.assertNotIn(f"/e/{self.ancient.id}", body)
        self.assertNotIn(f"/a/{self.hidden.id}", body)

    def test_never_lists_private_or_account_pages(self):
        body = self.body()
        for private in ("/host", "/artist/", "/settings", "/my-tickets", "/gate", "/checkout", "?q="):
            self.assertNotIn(private, body)
