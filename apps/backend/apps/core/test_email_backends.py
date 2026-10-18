"""CloudflareEmailBackend: payload shape, failure handling, and what never leaks."""

from unittest.mock import MagicMock, patch

import requests
from django.core.exceptions import ImproperlyConfigured
from django.core.mail import EmailMessage, EmailMultiAlternatives
from django.test import SimpleTestCase, override_settings

from apps.core.checks import cloudflare_email_needs_credentials
from apps.core.email_backends import CloudflareEmailBackend, EmailSendError

TOKEN = "cf-secret-token-0123456789"
CREDS = dict(
    CLOUDFLARE_ACCOUNT_ID="acct123",
    CLOUDFLARE_EMAIL_TOKEN=TOKEN,
    EMAIL_REPLY_TO="Showzy Support <support@showzy.in>",
    DEFAULT_FROM_EMAIL="Showzy <no-reply@mail.showzy.in>",
)


def ok(result=None):
    resp = MagicMock(status_code=200)
    resp.json.return_value = {
        "success": True, "errors": [], "messages": [],
        "result": result if result is not None else
        {"delivered": ["u@example.com"], "permanent_bounces": [], "queued": []},
    }
    return resp


def failure(status, code):
    resp = MagicMock(status_code=status)
    resp.json.return_value = {"success": False, "errors": [{"code": code, "message": "x"}], "result": None}
    return resp


@override_settings(**CREDS)
class CloudflareEmailBackendTests(SimpleTestCase):
    def _send(self, message, **kwargs):
        with patch("apps.core.email_backends.requests.post") as post:
            post.return_value = kwargs.pop("response", ok())
            sent = CloudflareEmailBackend(**kwargs).send_messages([message])
        return sent, post

    def test_posts_the_documented_shape(self):
        msg = EmailMessage("Hi", "body text", None, ["u@example.com"])
        sent, post = self._send(msg)
        self.assertEqual(sent, 1)
        (url,), kw = post.call_args
        self.assertEqual(url, "https://api.cloudflare.com/client/v4/accounts/acct123/email/sending/send")
        self.assertEqual(kw["headers"], {"Authorization": f"Bearer {TOKEN}"})
        self.assertFalse(kw["allow_redirects"])
        self.assertEqual(kw["timeout"], 8)
        self.assertEqual(
            kw["json"],
            {
                "to": "u@example.com",
                "from": {"address": "no-reply@mail.showzy.in", "name": "Showzy"},
                "subject": "Hi",
                "text": "body text",
                "reply_to": {"address": "support@showzy.in", "name": "Showzy Support"},
            },
        )

    def test_html_alternative_is_sent_alongside_text(self):
        msg = EmailMultiAlternatives("Hi", "plain", None, ["u@example.com"])
        msg.attach_alternative("<b>rich</b>", "text/html")
        _, post = self._send(msg)
        body = post.call_args.kwargs["json"]
        self.assertEqual((body["text"], body["html"]), ("plain", "<b>rich</b>"))

    def test_an_explicit_reply_to_wins_over_the_default(self):
        msg = EmailMessage("Hi", "b", None, ["u@example.com"], reply_to=["host@showzy.in"])
        _, post = self._send(msg)
        self.assertEqual(post.call_args.kwargs["json"]["reply_to"], "host@showzy.in")

    def test_extra_headers_pass_through_but_envelope_headers_do_not(self):
        msg = EmailMessage(
            "Hi", "b", None, ["u@example.com"],
            headers={"List-Unsubscribe": "<https://showzy.in/u/1>", "Reply-To": "evil@x.test"},
        )
        _, post = self._send(msg)
        body = post.call_args.kwargs["json"]
        self.assertEqual(body["headers"], {"List-Unsubscribe": "<https://showzy.in/u/1>"})
        self.assertEqual(body["reply_to"]["address"], "support@showzy.in")

    def test_more_than_one_recipient_is_refused_and_nothing_is_sent(self):
        for kwargs in (
            {"to": ["a@example.com", "b@example.com"]},
            {"to": ["a@example.com"], "cc": ["b@example.com"]},
            {"to": ["a@example.com"], "bcc": ["b@example.com"]},
        ):
            with patch("apps.core.email_backends.requests.post") as post:
                with self.assertRaises(EmailSendError):
                    CloudflareEmailBackend().send_messages([EmailMessage("Hi", "b", **kwargs)])
            post.assert_not_called()

    def test_attachments_and_empty_bodies_are_refused(self):
        with_attachment = EmailMessage("Hi", "b", None, ["u@example.com"])
        with_attachment.attach("a.txt", "x", "text/plain")
        with patch("apps.core.email_backends.requests.post") as post:
            with self.assertRaises(EmailSendError):
                CloudflareEmailBackend().send_messages([with_attachment])
            with self.assertRaises(EmailSendError):
                CloudflareEmailBackend().send_messages([EmailMessage("Hi", "", None, ["u@example.com"])])
        post.assert_not_called()

    def test_a_line_break_in_the_subject_is_refused(self):
        msg = EmailMessage("Hi", "b", None, ["u@example.com"])
        msg.subject = "Hi\nBcc: victim@example.com"
        with patch("apps.core.email_backends.requests.post") as post:
            with self.assertRaises(EmailSendError):
                CloudflareEmailBackend().send_messages([msg])
        post.assert_not_called()

    def test_http_errors_raise_with_the_status_and_code_but_never_the_token_or_body(self):
        msg = EmailMessage("Hi", "secret body 482913", None, ["u@example.com"])
        for status, code in ((401, 10101), (403, 10105), (429, 10004), (500, 10002)):
            with self.assertRaises(EmailSendError) as cm:
                self._send(msg, response=failure(status, code))
            text = str(cm.exception)
            self.assertIn(str(status), text)
            self.assertIn(str(code), text)
            self.assertNotIn(TOKEN, text)
            self.assertNotIn("482913", text)

    def test_network_failure_raises_without_leaking_the_url_or_token(self):
        msg = EmailMessage("Hi", "b", None, ["u@example.com"])
        boom = requests.ConnectionError(f"HTTPSConnectionPool(host='api.cloudflare.com'): Bearer {TOKEN}")
        with patch("apps.core.email_backends.requests.post", side_effect=boom):
            with self.assertRaises(EmailSendError) as cm:
                CloudflareEmailBackend().send_messages([msg])
        self.assertNotIn(TOKEN, str(cm.exception))
        self.assertNotIn("cloudflare.com", str(cm.exception))
        self.assertIsNone(cm.exception.__cause__)

    def test_a_timeout_is_an_error_not_a_hang(self):
        msg = EmailMessage("Hi", "b", None, ["u@example.com"])
        with patch("apps.core.email_backends.requests.post", side_effect=requests.Timeout()):
            with self.assertRaises(EmailSendError):
                CloudflareEmailBackend().send_messages([msg])

    def test_a_non_json_reply_is_an_error(self):
        resp = MagicMock(status_code=200)
        resp.json.side_effect = ValueError("not json")
        with self.assertRaises(EmailSendError):
            self._send(EmailMessage("Hi", "b", None, ["u@example.com"]), response=resp)

    def test_a_bounced_or_suppressed_recipient_is_a_failure(self):
        resp = ok({"delivered": [], "permanent_bounces": ["u@example.com"], "queued": []})
        with self.assertRaises(EmailSendError):
            self._send(EmailMessage("Hi", "b", None, ["u@example.com"]), response=resp)

    def test_queued_counts_as_accepted(self):
        resp = ok({"delivered": [], "permanent_bounces": [], "queued": ["u@example.com"]})
        sent, _ = self._send(EmailMessage("Hi", "b", None, ["u@example.com"]), response=resp)
        self.assertEqual(sent, 1)

    def test_fail_silently_swallows_the_error_and_reports_zero_sent(self):
        msg = EmailMessage("Hi", "b", None, ["u@example.com"])
        with self.assertLogs("apps.core.email_backends", level="WARNING"):
            sent, _ = self._send(msg, response=failure(500, 10002), fail_silently=True)
        self.assertEqual(sent, 0)


class CloudflareConfigTests(SimpleTestCase):
    @override_settings(CLOUDFLARE_ACCOUNT_ID="", CLOUDFLARE_EMAIL_TOKEN="")
    def test_the_backend_refuses_to_start_without_credentials(self):
        with self.assertRaises(ImproperlyConfigured):
            CloudflareEmailBackend()

    @override_settings(
        EMAIL_BACKEND="apps.core.email_backends.CloudflareEmailBackend",
        CLOUDFLARE_ACCOUNT_ID="a", CLOUDFLARE_EMAIL_TOKEN="",
    )
    def test_deploy_check_errors_when_the_token_is_missing(self):
        errors = cloudflare_email_needs_credentials(None)
        self.assertEqual([e.id for e in errors], ["naada.E003"])
        self.assertIn("CLOUDFLARE_EMAIL_TOKEN", errors[0].msg)
        self.assertNotIn("CLOUDFLARE_ACCOUNT_ID", errors[0].msg)

    @override_settings(
        EMAIL_BACKEND="apps.core.email_backends.CloudflareEmailBackend", **{
            "CLOUDFLARE_ACCOUNT_ID": "a", "CLOUDFLARE_EMAIL_TOKEN": "t"})
    def test_deploy_check_passes_when_configured(self):
        self.assertEqual(cloudflare_email_needs_credentials(None), [])

    @override_settings(EMAIL_BACKEND="django.core.mail.backends.console.EmailBackend")
    def test_deploy_check_ignores_other_backends(self):
        self.assertEqual(cloudflare_email_needs_credentials(None), [])


class SettingsSelectionTests(SimpleTestCase):
    """EMAIL_PROVIDER picks the backend (an explicit EMAIL_BACKEND still wins in base.py)."""

    def test_cloudflare_provider_selects_the_backend(self):
        from naada.settings.base import pick_email_backend

        self.assertTrue(pick_email_backend("cloudflare", False).endswith("CloudflareEmailBackend"))
        # Cloudflare beats SMTP credentials left over from an old setup.
        self.assertTrue(pick_email_backend("cloudflare", True).endswith("CloudflareEmailBackend"))

    def test_smtp_credentials_still_select_smtp(self):
        from naada.settings.base import pick_email_backend

        self.assertIn("smtp", pick_email_backend("", True))

    def test_default_is_the_console_backend(self):
        from naada.settings.base import pick_email_backend

        self.assertIn("console", pick_email_backend("", False))
