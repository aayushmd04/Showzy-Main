from django.core.management import call_command
from django.test import TestCase

from apps.artists.models import Artist
from apps.events.models import Event
from apps.venues.models import Venue


class SeedMoreTests(TestCase):
    """The demo-content command must be safe to run again and again."""

    def test_running_twice_adds_nothing_the_second_time(self):
        call_command("seed_data", verbosity=0)
        call_command("seed_more", verbosity=0)
        counts = (Event.objects.count(), Artist.objects.count(), Venue.objects.count())
        call_command("seed_more", verbosity=0)
        self.assertEqual(counts, (Event.objects.count(), Artist.objects.count(), Venue.objects.count()))
        self.assertGreater(Event.objects.count(), 15)

    def test_works_on_an_empty_database_without_seed_data(self):
        call_command("seed_more", verbosity=0)
        self.assertGreater(Event.objects.count(), 15)
        from django.contrib.auth import get_user_model
        # No account with a known password may be created.
        for user in get_user_model().objects.all():
            self.assertFalse(user.has_usable_password(), user.email)
