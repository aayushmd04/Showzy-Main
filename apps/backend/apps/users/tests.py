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
from .views import (
    OTPEmailThrottle, OTPRateThrottle, OTPVerifyEmailThrottle, OTPVerifyRateThrottle,
)

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
            otp_hash=OTPToken.hash_otp(
                self.raw_otp, OTPToken.binding_for("lockout@naada.test", OTPToken.Purpose.LOGIN)
            ),
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


class OTPHardeningTests(TestCase):
    """Code generation, storage, cooldown, expiry, failure handling, verify limits."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.request_url = reverse("auth-request-otp")
        self.verify_url = reverse("auth-verify-otp")
        self.email = "hard@naada.test"

    def tearDown(self):
        cache.clear()

    def _request(self, email=None, **extra):
        return self.client.post(
            self.request_url, {"email": email or self.email}, format="json", **extra
        )

    @override_settings(OTP_DEBUG_RESPONSE=True, OTP_RESEND_COOLDOWN_SECONDS=0)
    def test_code_is_stored_keyed_not_as_plain_sha256(self):
        import hashlib
        from .models import OTPToken

        raw = self._request().data["debug_otp"]
        token = OTPToken.objects.get(email=self.email)
        self.assertNotEqual(token.otp_hash, hashlib.sha256(raw.encode()).hexdigest())
        self.assertEqual(
            token.otp_hash,
            OTPToken.hash_otp(raw, OTPToken.binding_for(self.email, token.purpose)),
        )

    def test_hash_is_bound_to_the_address(self):
        from .models import OTPToken

        self.assertNotEqual(
            OTPToken.hash_otp("123456", "a@x.test|login"),
            OTPToken.hash_otp("123456", "b@x.test|login"),
        )

    @override_settings(OTP_PEPPER="one")
    def test_changing_the_pepper_invalidates_stored_codes(self):
        from .models import OTPToken

        before = OTPToken.hash_otp("123456", "a@x.test|login")
        with override_settings(OTP_PEPPER="two"):
            after = OTPToken.hash_otp("123456", "a@x.test|login")
        self.assertNotEqual(before, after)

    def test_generated_codes_are_numeric_and_the_right_length(self):
        from .models import OTPToken

        with override_settings(OTP_LENGTH=6):
            codes = {OTPToken.generate_otp() for _ in range(50)}
        self.assertTrue(all(len(c) == 6 and c.isdigit() for c in codes))
        self.assertGreater(len(codes), 40)  # not a constant

    def test_default_expiry_is_three_minutes(self):
        from django.conf import settings

        self.assertEqual(settings.OTP_EXPIRY_MINUTES, 3)

    @override_settings(OTP_DEBUG_RESPONSE=True)
    def test_response_tells_the_client_how_long_the_code_lives(self):
        data = self._request().data
        self.assertEqual(data["expires_in"], 180)
        self.assertEqual(data["resend_after"], 45)

    @override_settings(OTP_RESEND_COOLDOWN_SECONDS=45)
    def test_a_second_request_inside_the_cooldown_is_refused_and_sends_nothing(self):
        from django.core import mail

        self.assertEqual(self._request().status_code, 200)
        again = self._request()
        self.assertEqual(again.status_code, 429)
        self.assertGreater(again.data["retry_after"], 0)
        self.assertIn("Retry-After", again)
        self.assertEqual(len(mail.outbox), 1)

    @override_settings(OTP_RESEND_COOLDOWN_SECONDS=45)
    def test_cooldown_is_per_address(self):
        self.assertEqual(self._request().status_code, 200)
        self.assertEqual(self._request("other@naada.test").status_code, 200)

    @override_settings(OTP_RESEND_COOLDOWN_SECONDS=45)
    def test_cooldown_ends(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import OTPToken

        self._request()
        OTPToken.objects.update(created_at=timezone.now() - timedelta(seconds=46))
        self.assertEqual(self._request().status_code, 200)

    @override_settings(OTP_DEBUG_RESPONSE=True, OTP_RESEND_COOLDOWN_SECONDS=0)
    def test_a_new_code_kills_the_old_one(self):
        old = self._request().data["debug_otp"]
        new = self._request().data["debug_otp"]
        bad = self.client.post(
            self.verify_url, {"email": self.email, "otp": old}, format="json"
        )
        if old != new:
            self.assertEqual(bad.status_code, 400)
        good = self.client.post(
            self.verify_url, {"email": self.email, "otp": new}, format="json"
        )
        self.assertEqual(good.status_code, 200)

    @override_settings(OTP_DEBUG_RESPONSE=True)
    def test_an_expired_code_is_refused(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import OTPToken

        raw = self._request().data["debug_otp"]
        OTPToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        resp = self.client.post(
            self.verify_url, {"email": self.email, "otp": raw}, format="json"
        )
        self.assertEqual(resp.status_code, 400)

    def test_a_failed_send_returns_503_leaks_no_code_and_leaves_no_cooldown(self):
        from .models import OTPToken

        with patch("apps.users.views.send_mail", side_effect=OSError("smtp down")):
            with self.assertLogs("apps.users.views", level="ERROR") as logs:
                resp = self._request()
        self.assertEqual(resp.status_code, 503)
        self.assertNotIn("debug_otp", resp.data)
        self.assertFalse(OTPToken.objects.filter(email=self.email).exists())
        # Nothing the log recorded contains a six-digit code.
        import re
        self.assertIsNone(re.search(r"\b\d{6}\b", " ".join(logs.output)))
        # The user can retry straight away.
        self.assertEqual(self._request().status_code, 200)

    def test_email_does_not_contain_the_code_in_the_subject(self):
        from django.core import mail

        self._request()
        msg = mail.outbox[0]
        self.assertNotRegex(msg.subject, r"\d{4,}")
        self.assertRegex(msg.body, r"\b\d{6}\b")
        self.assertIn("3 minutes", msg.body)

    def test_verify_is_throttled_per_address_across_tokens(self):
        with patch.object(OTPVerifyEmailThrottle, "get_rate", return_value="3/hour"), \
             patch.object(OTPVerifyRateThrottle, "get_rate", return_value="1000/hour"):
            codes = [
                self.client.post(
                    self.verify_url,
                    {"email": self.email, "otp": "000000"},
                    format="json",
                    REMOTE_ADDR=f"203.0.113.{i + 1}",
                ).status_code
                for i in range(6)
            ]
        self.assertIn(429, codes, codes)

    def test_verify_is_throttled_per_caller(self):
        with patch.object(OTPVerifyRateThrottle, "get_rate", return_value="3/hour"), \
             patch.object(OTPVerifyEmailThrottle, "get_rate", return_value="1000/hour"):
            codes = [
                self.client.post(
                    self.verify_url,
                    {"email": f"u{i}@naada.test", "otp": "000000"},
                    format="json",
                    REMOTE_ADDR="198.51.100.20",
                ).status_code
                for i in range(6)
            ]
        self.assertIn(429, codes, codes)

    def test_daily_cap_applies_even_when_the_hourly_cap_is_not_hit(self):
        from .views import OTPEmailDayThrottle

        with override_settings(OTP_RESEND_COOLDOWN_SECONDS=0), \
             patch.object(OTPEmailDayThrottle, "get_rate", return_value="3/day"), \
             patch.object(OTPEmailThrottle, "get_rate", return_value="100/hour"), \
             patch.object(OTPRateThrottle, "get_rate", return_value="100/hour"):
            codes = [self._request().status_code for _ in range(6)]
        self.assertIn(429, codes, codes)

    @override_settings(OTP_DEBUG_RESPONSE=False)
    def test_the_code_is_never_echoed_unless_the_setting_allows_it(self):
        self.assertNotIn("debug_otp", self._request().data)


class ClientIPTests(TestCase):
    """A caller must not be able to choose the address we throttle them under."""

    def _req(self, **meta):
        return APIRequestFactory().post("/x/", **meta)

    def test_spoofed_leading_forwarded_for_is_ignored(self):
        from apps.core.net import get_client_ip

        # Client sent "1.2.3.4"; our one proxy appended the real address.
        req = self._req(HTTP_X_FORWARDED_FOR="1.2.3.4, 203.0.113.9", REMOTE_ADDR="10.0.0.1")
        self.assertEqual(get_client_ip(req), "203.0.113.9")

    @override_settings(TRUSTED_PROXY_COUNT=2)
    def test_two_proxies_in_front(self):
        from apps.core.net import get_client_ip

        req = self._req(
            HTTP_X_FORWARDED_FOR="9.9.9.9, 203.0.113.9, 172.16.0.1", REMOTE_ADDR="10.0.0.1"
        )
        self.assertEqual(get_client_ip(req), "203.0.113.9")

    def test_without_the_header_falls_back_to_the_socket(self):
        from apps.core.net import get_client_ip

        self.assertEqual(get_client_ip(self._req(REMOTE_ADDR="198.51.100.5")), "198.51.100.5")

    def test_a_chain_shorter_than_the_trusted_count_falls_back_to_the_socket(self):
        from apps.core.net import get_client_ip

        with override_settings(TRUSTED_PROXY_COUNT=3):
            req = self._req(HTTP_X_FORWARDED_FOR="1.1.1.1", REMOTE_ADDR="198.51.100.5")
            self.assertEqual(get_client_ip(req), "198.51.100.5")

    @override_settings(CLIENT_IP_HEADER="CF-Connecting-IP")
    def test_edge_header_wins_when_configured(self):
        from apps.core.net import get_client_ip

        req = self._req(
            HTTP_CF_CONNECTING_IP="203.0.113.77",
            HTTP_X_FORWARDED_FOR="1.2.3.4",
            REMOTE_ADDR="10.0.0.1",
        )
        self.assertEqual(get_client_ip(req), "203.0.113.77")

    def test_edge_header_is_ignored_when_not_configured(self):
        from apps.core.net import get_client_ip

        req = self._req(HTTP_CF_CONNECTING_IP="6.6.6.6", REMOTE_ADDR="198.51.100.5")
        self.assertEqual(get_client_ip(req), "198.51.100.5")


class PurgeOTPTokensTests(TestCase):
    def test_only_old_tokens_are_deleted(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import OTPToken
        from .tasks import purge_old_otp_tokens

        fresh, _ = OTPToken.issue("fresh@naada.test", "login")
        old, _ = OTPToken.issue("old@naada.test", "login")
        OTPToken.objects.filter(pk=old.pk).update(created_at=timezone.now() - timedelta(hours=25))

        self.assertEqual(purge_old_otp_tokens(), 1)
        self.assertTrue(OTPToken.objects.filter(pk=fresh.pk).exists())
        self.assertFalse(OTPToken.objects.filter(pk=old.pk).exists())


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
