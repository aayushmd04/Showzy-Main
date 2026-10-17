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
