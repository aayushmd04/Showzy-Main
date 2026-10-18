"""Turnstile: what we ask Cloudflare, and what we do with each answer."""

from unittest.mock import MagicMock, patch

import requests
from django.core import mail
from django.core.cache import cache
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core import turnstile
from apps.core.checks import turnstile_should_be_on

SECRET = "turnstile-secret-xyz"


def reply(body, status=200):
    resp = MagicMock(status_code=status)
    resp.json.return_value = body
    return resp


@override_settings(TURNSTILE_SECRET_KEY=SECRET)
class VerifyTests(SimpleTestCase):
    def _verify(self, response=None, token="tok", ip="203.0.113.5", **kw):
        with patch("apps.core.turnstile.requests.post") as post:
            post.return_value = response if response is not None else reply({"success": True})
            return turnstile.verify(token, ip, **kw), post

    def test_sends_secret_token_and_ip_to_siteverify(self):
        ok, post = self._verify()
        self.assertTrue(ok)
        (url,), kw = post.call_args
        self.assertEqual(url, "https://challenges.cloudflare.com/turnstile/v0/siteverify")
        self.assertEqual(kw["data"], {"secret": SECRET, "response": "tok", "remoteip": "203.0.113.5"})
        self.assertFalse(kw["allow_redirects"])
        self.assertEqual(kw["timeout"], 3)

    def test_an_explicit_no_rejects(self):
        ok, _ = self._verify(reply({"success": False, "error-codes": ["invalid-input-response"]}))
        self.assertFalse(ok)

    def test_missing_oversized_or_non_string_tokens_are_rejected_without_a_call(self):
        for token in ("", None, 123, "x" * 2049):
            with patch("apps.core.turnstile.requests.post") as post:
                self.assertFalse(turnstile.verify(token, "1.2.3.4"))
            post.assert_not_called()

    def test_a_token_for_a_different_action_is_rejected(self):
        ok, _ = self._verify(reply({"success": True, "action": "checkout"}))
        self.assertFalse(ok)

    def test_the_matching_action_is_accepted(self):
        ok, _ = self._verify(reply({"success": True, "action": "request-otp"}))
        self.assertTrue(ok)

    @override_settings(TURNSTILE_ALLOWED_HOSTNAMES=["showzy.in", "app.showzy.in"])
    def test_hostname_allow_list(self):
        self.assertTrue(self._verify(reply({"success": True, "hostname": "app.showzy.in"}))[0])
        self.assertFalse(self._verify(reply({"success": True, "hostname": "evil.example"}))[0])

    def test_an_unreachable_cloudflare_lets_the_request_through_and_logs(self):
        with patch("apps.core.turnstile.requests.post", side_effect=requests.Timeout(SECRET)):
            with self.assertLogs("apps.core.turnstile", level="ERROR") as logs:
                self.assertTrue(turnstile.verify("tok", "1.2.3.4"))
        self.assertNotIn(SECRET, " ".join(logs.output))

    def test_garbage_from_cloudflare_lets_the_request_through(self):
        resp = MagicMock(status_code=502)
        resp.json.side_effect = ValueError("<html>")
        with self.assertLogs("apps.core.turnstile", level="ERROR"):
            self.assertTrue(self._verify(resp)[0])

    @override_settings(TURNSTILE_SECRET_KEY="")
    def test_off_when_no_secret_is_configured(self):
        with patch("apps.core.turnstile.requests.post") as post:
            self.assertTrue(turnstile.verify("", None))
        post.assert_not_called()


class DeployCheckTests(SimpleTestCase):
    @override_settings(DEBUG=False, TURNSTILE_SECRET_KEY="")
    def test_warns_when_off_in_production(self):
        self.assertEqual([w.id for w in turnstile_should_be_on(None)], ["naada.W004"])

    @override_settings(DEBUG=False, TURNSTILE_SECRET_KEY="s")
    def test_quiet_when_on(self):
        self.assertEqual(turnstile_should_be_on(None), [])


@override_settings(TURNSTILE_SECRET_KEY=SECRET, OTP_RESEND_COOLDOWN_SECONDS=0)
class RequestOtpTurnstileTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.url = reverse("auth-request-otp")

    def tearDown(self):
        cache.clear()

    def _post(self, **body):
        return self.client.post(self.url, {"email": "t@naada.test", **body}, format="json")

    def test_no_token_means_no_code_and_no_mail(self):
        from apps.users.models import OTPToken

        with patch("apps.core.turnstile.requests.post") as post:
            resp = self._post()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.data["code"], "turnstile_failed")
        post.assert_not_called()
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(OTPToken.objects.exists())

    def test_a_rejected_token_means_no_code_and_no_mail(self):
        from apps.users.models import OTPToken

        with patch("apps.core.turnstile.requests.post", return_value=reply({"success": False})):
            resp = self._post(turnstile_token="bad")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(len(mail.outbox), 0)
        self.assertFalse(OTPToken.objects.exists())

    def test_a_good_token_sends_the_code(self):
        with patch("apps.core.turnstile.requests.post", return_value=reply({"success": True})):
            resp = self._post(turnstile_token="good")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_the_token_is_not_echoed_back(self):
        with patch("apps.core.turnstile.requests.post", return_value=reply({"success": True})):
            resp = self._post(turnstile_token="good")
        self.assertNotIn("turnstile_token", resp.data)

    @override_settings(TURNSTILE_SECRET_KEY="")
    def test_without_a_secret_the_endpoint_works_as_before(self):
        self.assertEqual(self._post().status_code, 200)
