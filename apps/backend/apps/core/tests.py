"""Tests for the forgiving URL and social-handle fields.

A musician typing `google.com` into a website box was told it was invalid,
because Django's URLField demands a scheme nobody types. These cover the shapes
people actually enter.
"""

from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

from apps.core.urlfields import ForgivingURLField, SocialHandleField


class ForgivingUrlTests(SimpleTestCase):
    def setUp(self):
        self.field = ForgivingURLField()

    def test_a_bare_domain_gets_a_scheme(self):
        self.assertEqual(self.field.to_internal_value("google.com"), "https://google.com")

    def test_an_indian_tld_works(self):
        self.assertEqual(self.field.to_internal_value("myband.in"), "https://myband.in")

    def test_a_multi_part_tld_with_a_path_works(self):
        self.assertEqual(
            self.field.to_internal_value("sub.example.co.in/page"),
            "https://sub.example.co.in/page",
        )

    def test_an_explicit_scheme_is_left_alone(self):
        for value in ("https://google.com", "http://google.com"):
            self.assertEqual(self.field.to_internal_value(value), value)

    def test_www_without_a_scheme_works(self):
        self.assertEqual(
            self.field.to_internal_value("www.google.com"), "https://www.google.com"
        )

    def test_surrounding_whitespace_is_ignored(self):
        self.assertEqual(self.field.to_internal_value("  google.com "), "https://google.com")

    def test_blank_stays_blank_rather_than_erroring(self):
        self.assertEqual(self.field.to_internal_value(""), "")

    def test_prose_is_still_rejected(self):
        for value in ("not a website", "hello", "just some words"):
            with self.assertRaises(ValidationError):
                self.field.to_internal_value(value)

    def test_the_rejection_message_shows_an_example(self):
        with self.assertRaises(ValidationError) as ctx:
            self.field.to_internal_value("hello")
        self.assertIn("yourband.com", str(ctx.exception))


class SocialHandleTests(SimpleTestCase):
    def setUp(self):
        self.field = SocialHandleField(platform="Instagram", hosts=("instagram.com",))

    def test_every_way_people_give_a_handle_lands_on_the_same_value(self):
        for value in (
            "naada.live",
            "@naada.live",
            "https://instagram.com/naada.live",
            "instagram.com/naada.live/",
            "https://www.instagram.com/naada.live?hl=en",
        ):
            self.assertEqual(self.field.to_internal_value(value), "naada.live")

    def test_blank_stays_blank(self):
        self.assertEqual(self.field.to_internal_value(""), "")

    def test_a_handle_with_illegal_characters_is_rejected(self):
        with self.assertRaises(ValidationError):
            self.field.to_internal_value("not a handle!")


class IndianPhoneTests(SimpleTestCase):
    """One phone number must be one stored value.

    The column is unique, but every spelling used to store separately — so the
    same line could back three accounts and uniqueness meant nothing.
    """

    def setUp(self):
        from apps.core.urlfields import IndianPhoneField
        self.field = IndianPhoneField()

    def test_every_way_of_typing_one_number_normalises_the_same(self):
        for value in (
            "+91 98450 11223",
            "9845011223",
            "+91-98450-11223",
            "098450 11223",
            "919845011223",
            "(+91) 98450-11223",
        ):
            self.assertEqual(self.field.to_internal_value(value), "+919845011223", value)

    def test_blank_stays_blank(self):
        self.assertEqual(self.field.to_internal_value(""), "")

    def test_a_landline_style_prefix_is_rejected(self):
        # Indian mobiles start 6-9; 1-5 is not a mobile.
        with self.assertRaises(ValidationError):
            self.field.to_internal_value("1234567890")

    def test_too_few_digits_is_rejected_with_an_example(self):
        with self.assertRaises(ValidationError) as ctx:
            self.field.to_internal_value("98450")
        self.assertIn("10 digits", str(ctx.exception))

    def test_another_country_in_full_international_form_is_kept(self):
        self.assertEqual(self.field.to_internal_value("+442079460958"), "+442079460958")


class ReadsAreNeverThrottledTests(SimpleTestCase):
    """Browsing the site must not be able to lock a visitor out.

    A page makes a dozen or so reads and mobile users share an IP, so counting
    reads per IP blocks real people within a few page loads. Reads pass; writes
    are still counted.
    """

    def setUp(self):
        from django.core.cache import cache

        cache.clear()

    def _request(self, method):
        from rest_framework.request import Request
        from rest_framework.test import APIRequestFactory

        return Request(getattr(APIRequestFactory(), method)("/api/v1/events/"))

    def test_a_visitor_can_read_far_past_the_write_limit(self):
        from unittest.mock import patch

        from apps.core.throttles import WriteAnonThrottle

        with patch.object(WriteAnonThrottle, "get_rate", return_value="3/hour"):
            for _ in range(50):
                self.assertTrue(WriteAnonThrottle().allow_request(self._request("get"), None))

    def test_writes_are_still_counted(self):
        from unittest.mock import patch

        from apps.core.throttles import WriteAnonThrottle

        with patch.object(WriteAnonThrottle, "get_rate", return_value="3/hour"):
            results = [WriteAnonThrottle().allow_request(self._request("post"), None) for _ in range(6)]
        self.assertIn(False, results, "writes were never throttled")
        self.assertEqual(results[:3], [True, True, True])
