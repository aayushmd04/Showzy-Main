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
