"""Tests for role selection.

`PATCH /auth/me/` never had `role` on its write serializer — role selection
at signup was silently a no-op, masked only by the frontend faking the role
locally for the rest of that browser session. On any later login the account
came back as `attendee` regardless of what the user actually picked, losing
access to their own dashboard. `set_role` is the real fix; these tests pin
both that it actually persists and that it can never be used to grant admin.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.urls import reverse
from django.test import TestCase, override_settings
from rest_framework.test import APIClient, APIRequestFactory
from rest_framework.views import APIView

from apps.core.checks import email_must_actually_send, throttle_needs_a_shared_cache
from .views import OTPEmailThrottle, OTPRateThrottle

from apps.artists.models import Artist
from .models import UserRole

User = get_user_model()


class SetRoleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="role-test@naada.test", full_name="Role Test")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_selecting_artist_persists_the_role(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ARTIST)

    def test_selecting_artist_creates_a_bookable_artist_row(self):
        self.assertFalse(Artist.objects.filter(user=self.user).exists())
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertTrue(Artist.objects.filter(user=self.user).exists())

    def test_selecting_artist_twice_does_not_duplicate_the_artist_row(self):
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(Artist.objects.filter(user=self.user).count(), 1)

    def test_selecting_venue_owner_persists_and_creates_nothing_extra(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "venue_owner"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.VENUE_OWNER)
        self.assertFalse(Artist.objects.filter(user=self.user).exists())

    def test_cannot_self_promote_to_admin(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "admin"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ATTENDEE)

    def test_garbage_role_value_is_rejected(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "superuser"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_requires_authentication(self):
        anon = APIClient()
        resp = anon.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_patching_me_cannot_change_role(self):
        """The bug this whole endpoint exists to fix, pinned directly: the
        general profile-update path must never be able to touch role, in
        either direction — not silently ignoring it (the original bug) and
        not accidentally accepting it later (the security risk)."""
        resp = self.client.patch(reverse("auth-me"), {"role": "admin"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ATTENDEE)


class OTPThrottleTests(TestCase):
    """The sign-in endpoint is throttled two ways, and both matter.

    Per-IP alone stops one attacker but not many: rotating IPs is cheap enough
    that a victim's inbox could be flooded with sign-in codes, taking the free
    email tier's daily quota down with it. Per-address alone would let one
    caller walk a list of addresses. These pin that both budgets exist.

    The rates are patched on the throttle classes rather than through
    `override_settings(REST_FRAMEWORK=...)`: DRF caches its own settings object,
    so overriding the Django setting leaves the live rate untouched and the
    test passes against a limit that was never actually applied.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("auth-request-otp")
        # Throttle counters live in the cache and outlive a single test.
        cache.clear()

    def tearDown(self):
        cache.clear()

    @staticmethod
    def _rate(throttle_cls, rate):
        return patch.object(throttle_cls, "get_rate", return_value=rate)

    def test_one_address_cannot_be_flooded_from_many_ips(self):
        with self._rate(OTPEmailThrottle, "3/hour"), self._rate(OTPRateThrottle, "100/hour"):
            codes = [
                self.client.post(
                    self.url,
                    {"email": "victim@naada.test"},
                    format="json",
                    REMOTE_ADDR=f"203.0.113.{i + 1}",  # a different caller every time
                ).status_code
                for i in range(6)
            ]
        self.assertIn(429, codes, f"a new IP each time was never throttled: {codes}")

    def test_one_caller_cannot_walk_a_list_of_addresses(self):
        with self._rate(OTPEmailThrottle, "100/hour"), self._rate(OTPRateThrottle, "3/hour"):
            codes = [
                self.client.post(
                    self.url,
                    {"email": f"target{i}@naada.test"},
                    format="json",
                    REMOTE_ADDR="198.51.100.7",  # one caller, many addresses
                ).status_code
                for i in range(6)
            ]
        self.assertIn(429, codes, f"one IP walking addresses was never throttled: {codes}")

    def test_a_body_with_no_address_does_not_spend_the_budget(self):
        # A malformed body comes back 400 from the serializer, and must not
        # consume the real caller's one allowed send.
        with self._rate(OTPEmailThrottle, "1/hour"), self._rate(OTPRateThrottle, "100/hour"):
            bad = self.client.post(self.url, {}, format="json", REMOTE_ADDR="198.51.100.9")
            self.assertEqual(bad.status_code, 400, bad.data)

            good = self.client.post(
                self.url, {"email": "ok@naada.test"}, format="json", REMOTE_ADDR="198.51.100.9"
            )
            self.assertEqual(good.status_code, 200, good.data)

    def test_the_address_key_is_case_and_whitespace_insensitive(self):
        # Otherwise " Victim@Naada.test " is a fresh budget for the same inbox.
        throttle = OTPEmailThrottle()
        factory = APIRequestFactory()

        def key_for(raw):
            request = APIView().initialize_request(
                factory.post("/auth/request-otp/", {"email": raw}, format="json")
            )
            return throttle.get_cache_key(request, None)

        self.assertEqual(key_for("Victim@Naada.test"), key_for("  victim@naada.test "))

    def test_an_address_that_is_not_a_string_is_ignored_rather_than_crashing(self):
        throttle = OTPEmailThrottle()
        factory = APIRequestFactory()
        request = APIView().initialize_request(
            factory.post("/auth/request-otp/", {"email": ["a@b.test"]}, format="json")
        )
        self.assertIsNone(throttle.get_cache_key(request, None))


class OTPAttemptLockoutTests(TestCase):
    """`OTPToken.verify()` must actually stop at `OTP_MAX_ATTEMPTS` guesses.

    The lockout used to be a plain read-then-write on `attempt_count`, so
    several guesses fired at once could all read the same stale count before
    any single write landed — each one still got a real guess against the
    hash instead of being turned away. The check is now one atomic
    conditional UPDATE per attempt; these pin the sequential behaviour that
    update must preserve.
    """

    def setUp(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import OTPToken

        self.OTPToken = OTPToken
        self.raw_otp = "482913"
        self.token = OTPToken.objects.create(
            email="lockout@naada.test",
            otp_hash=OTPToken.hash_otp(self.raw_otp),
            expires_at=timezone.now() + timedelta(minutes=5),
        )

    @override_settings(OTP_MAX_ATTEMPTS=3)
    def test_wrong_guesses_are_refused_and_counted(self):
        self.assertFalse(self.token.verify("000000"))
        self.token.refresh_from_db()
        self.assertEqual(self.token.attempt_count, 1)

    @override_settings(OTP_MAX_ATTEMPTS=3)
    def test_correct_code_still_works_within_the_limit(self):
        self.assertFalse(self.token.verify("000000"))
        self.assertTrue(self.token.verify(self.raw_otp))
        self.token.refresh_from_db()
        self.assertTrue(self.token.is_used)

    @override_settings(OTP_MAX_ATTEMPTS=3)
    def test_the_correct_code_is_refused_once_the_limit_is_spent(self):
        self.assertFalse(self.token.verify("000000"))
        self.assertFalse(self.token.verify("111111"))
        self.assertFalse(self.token.verify("222222"))
        # Three wrong guesses have now spent the whole budget — even the
        # right code must not work after this point.
        self.assertFalse(self.token.verify(self.raw_otp))
        self.token.refresh_from_db()
        self.assertFalse(self.token.is_used)
        self.assertEqual(self.token.attempt_count, 3)


class DeployCheckTests(TestCase):
    """The two ways a deploy can look healthy and quietly not be."""

    @override_settings(
        DEBUG=False,
        CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}},
    )
    def test_warns_when_throttling_has_no_shared_cache(self):
        ids = [w.id for w in throttle_needs_a_shared_cache(None)]
        self.assertEqual(ids, ["naada.W001"])

    @override_settings(
        DEBUG=False,
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.redis.RedisCache",
                "LOCATION": "redis://localhost:6379/0",
            }
        },
    )
    def test_silent_when_a_real_cache_is_configured(self):
        self.assertEqual(throttle_needs_a_shared_cache(None), [])

    @override_settings(DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_warns_when_sign_in_codes_would_only_reach_the_log(self):
        ids = [w.id for w in email_must_actually_send(None)]
        self.assertEqual(ids, ["naada.W002"])

    @override_settings(DEBUG=False, EMAIL_BACKEND="django.core.mail.backends.smtp.EmailBackend")
    def test_silent_when_smtp_is_configured(self):
        self.assertEqual(email_must_actually_send(None), [])

    @override_settings(DEBUG=True, EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_says_nothing_in_development(self):
        self.assertEqual(email_must_actually_send(None), [])
