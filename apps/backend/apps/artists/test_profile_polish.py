"""An artist's profile: optional website, what is missing, and photos that load.

Three things went wrong for a real artist in one sitting. The website box
refused "none" for someone who simply has no website, the dashboard never said
what a host would look for and the profile lacked, and the photo they uploaded
came back as a broken image because uploads were never served in production.
"""

import io
import shutil
import tempfile

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.urls import clear_url_caches, reverse
from PIL import Image
from rest_framework.test import APIClient

from apps.core.models import City, Genre
from .completeness import join_gaps, profile_gaps
from .models import Artist, ArtistPhoto

User = get_user_model()



def png_bytes():
    """A real 1x1 image, so Pillow accepts the upload."""
    buf = io.BytesIO()
    Image.new("RGB", (1, 1), "#C4472E").save(buf, "PNG")
    return buf.getvalue()


class ArtistProfileTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="solo@naada.test", full_name="Solo Act")
        self.artist = Artist.objects.create(user=self.user, stage_name="Solo Act")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.url = reverse("artists-detail", args=[self.artist.id])


class OptionalWebsiteTests(ArtistProfileTestCase):
    def patch_website(self, value):
        return self.client.patch(self.url, {"website": value}, format="json")

    def test_a_blank_website_saves(self):
        self.artist.website = "https://old.example.com"
        self.artist.save()
        resp = self.patch_website("")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["website"], "")

    def test_leaving_the_website_out_entirely_saves_everything_else(self):
        resp = self.client.patch(self.url, {"bio": "Sitar and tabla duo."}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)

    def test_saying_you_have_no_website_is_not_an_error(self):
        for answer in ("none", "None", "N/A", "na", "no", "-", " nil "):
            with self.subTest(answer=answer):
                resp = self.patch_website(answer)
                self.assertEqual(resp.status_code, 200, resp.data)
                self.assertEqual(resp.data["website"], "")

    def test_a_website_typed_without_https_is_saved_with_it(self):
        resp = self.patch_website("solo-act.in")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["website"], "https://solo-act.in")
        self.artist.refresh_from_db()
        self.assertEqual(self.artist.website, "https://solo-act.in")

    def test_a_sentence_is_still_refused_with_a_message_naming_the_field(self):
        resp = self.patch_website("my band is on instagram")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("website", resp.data)


class ProfileGapsTests(ArtistProfileTestCase):
    def finish(self):
        ArtistPhoto.objects.create(artist=self.artist, image="artists/2026/10/a.png", is_primary=True)
        self.artist.genres.add(Genre.objects.create(name="Folk", slug="folk"))
        self.artist.city = City.objects.create(name="Mysuru", slug="mysuru")
        self.artist.bio = "Folk songs from the Malnad hills, played on a handmade dotara."
        self.artist.booking_fee_min, self.artist.booking_fee_max = 4000, 9000
        self.artist.save()

    def test_a_brand_new_profile_lacks_everything_a_host_looks_for(self):
        self.assertEqual(
            profile_gaps(self.artist),
            ["a photo", "your genres", "your city", "a short bio", "your fee range"],
        )

    def test_a_finished_profile_has_no_gaps_even_without_a_website(self):
        self.finish()
        self.assertEqual(self.artist.website, "")
        self.assertEqual(profile_gaps(Artist.objects.get(pk=self.artist.pk)), [])

    def test_a_backwards_fee_range_counts_as_missing(self):
        self.finish()
        self.artist.booking_fee_min, self.artist.booking_fee_max = 9000, 4000
        self.artist.save()
        self.assertEqual(profile_gaps(Artist.objects.get(pk=self.artist.pk)), ["your fee range"])

    def test_the_api_reports_the_gaps_to_the_artist(self):
        resp = self.client.get(reverse("artists-mine"))
        self.assertEqual(resp.status_code, 200)
        self.assertIn("a photo", resp.data["profile_gaps"])
        self.finish()
        self.assertEqual(self.client.get(reverse("artists-mine")).data["profile_gaps"], [])

    def test_gaps_read_as_a_sentence(self):
        self.assertEqual(join_gaps([]), "")
        self.assertEqual(join_gaps(["a photo"]), "a photo")
        self.assertEqual(join_gaps(["a photo", "your city"]), "a photo and your city")
        self.assertEqual(join_gaps(["a photo", "your city", "a bio"]), "a photo, your city and a bio")


class UploadedPhotoIsServedTests(ArtistProfileTestCase):
    """The photo an artist uploads has to come back as an image, not a 404."""

    def setUp(self):
        super().setUp()
        self.media_root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)

    def upload(self):
        resp = self.client.post(
            reverse("artists-photos", args=[self.artist.id]),
            {"image": SimpleUploadedFile("me.png", png_bytes(), content_type="image/png")},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.data)
        return resp.data

    def test_a_production_deployment_serves_what_was_uploaded(self):
        with override_settings(DEBUG=False, MEDIA_ROOT=self.media_root, MEDIA_URL="/media/"):
            # urls.py reads settings once at import; reload it under production settings.
            import importlib
            import naada.urls
            importlib.reload(naada.urls)
            clear_url_caches()
            try:
                photo = self.upload()
                path = photo["image"].split("testserver", 1)[1]
                resp = APIClient().get(path)
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(b"".join(resp.streaming_content)[:8], png_bytes()[:8])
            finally:
                importlib.reload(naada.urls)
                clear_url_caches()

    def test_the_first_photo_becomes_the_cover(self):
        with override_settings(MEDIA_ROOT=self.media_root):
            self.assertTrue(self.upload()["is_primary"])
