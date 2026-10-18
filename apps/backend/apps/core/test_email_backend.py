from unittest import mock

import requests
from django.core.mail import EmailMultiAlternatives, send_mail
from django.test import SimpleTestCase, override_settings

BACKEND = "apps.core.email_backend.ResendEmailBackend"


@override_settings(EMAIL_BACKEND=BACKEND, RESEND_API_KEY="re_test_key", EMAIL_TIMEOUT=5)
class ResendBackendTests(SimpleTestCase):
    def test_sends_the_message_over_https_with_the_key(self):
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            n = send_mail("Your Showzy sign-in code", "Code: 123456", "Showzy <auth@showzy.in>", ["a@example.com"])
        self.assertEqual(n, 1)
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.resend.com/emails")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer re_test_key")
        self.assertEqual(kwargs["timeout"], 5)
        self.assertEqual(kwargs["json"]["from"], "Showzy <auth@showzy.in>")
        self.assertEqual(kwargs["json"]["to"], ["a@example.com"])
        self.assertEqual(kwargs["json"]["text"], "Code: 123456")

    def test_html_alternative_is_carried_across(self):
        msg = EmailMultiAlternatives("Hi", "plain", "Showzy <alerts@showzy.in>", ["a@example.com"])
        msg.attach_alternative("<p>rich</p>", "text/html")
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            msg.send()
        self.assertEqual(post.call_args.kwargs["json"]["html"], "<p>rich</p>")

    def test_a_failed_send_raises_so_the_caller_can_report_it(self):
        with mock.patch("apps.core.email_backend.requests.post", side_effect=requests.ConnectionError("down")):
            with self.assertRaises(requests.ConnectionError):
                send_mail("s", "b", "Showzy <auth@showzy.in>", ["a@example.com"])

    def test_fail_silently_returns_zero(self):
        with mock.patch("apps.core.email_backend.requests.post", side_effect=requests.Timeout()):
            n = send_mail("s", "b", "Showzy <auth@showzy.in>", ["a@example.com"], fail_silently=True)
        self.assertEqual(n, 0)

    @override_settings(RESEND_API_KEY="")
    def test_without_a_key_it_refuses_instead_of_pretending(self):
        with self.assertRaises(RuntimeError):
            send_mail("s", "b", "Showzy <auth@showzy.in>", ["a@example.com"])


@override_settings(EMAIL_BACKEND="apps.core.email_backend.BrevoEmailBackend", BREVO_API_KEY="xkeysib-test", EMAIL_TIMEOUT=5)
class BrevoBackendTests(SimpleTestCase):
    def test_sends_in_brevos_shape_with_the_api_key_header(self):
        msg = EmailMultiAlternatives("Hi", "plain", "Showzy <alerts@showzy.in>", ["a@example.com"], reply_to=["help@showzy.in"])
        msg.attach_alternative("<p>rich</p>", "text/html")
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            self.assertEqual(msg.send(), 1)
        args, kwargs = post.call_args
        self.assertEqual(args[0], "https://api.brevo.com/v3/smtp/email")
        self.assertEqual(kwargs["headers"], {"api-key": "xkeysib-test"})
        body = kwargs["json"]
        self.assertEqual(body["sender"], {"email": "alerts@showzy.in", "name": "Showzy"})
        self.assertEqual(body["to"], [{"email": "a@example.com"}])
        self.assertEqual(body["textContent"], "plain")
        self.assertEqual(body["htmlContent"], "<p>rich</p>")
        self.assertEqual(body["replyTo"], {"email": "help@showzy.in"})


@override_settings(
    EMAIL_BACKEND="apps.core.email_backend.HttpsEmailBackend",
    RESEND_API_KEY="re_key",
    BREVO_API_KEY="xkeysib-key",
    EMAIL_PROVIDER_ORDER="resend,brevo",
)
class FailoverTests(SimpleTestCase):
    def _send(self, **kwargs):
        return send_mail("s", "b", "Showzy <auth@showzy.in>", ["a@example.com"], **kwargs)

    def _refuse_resend(self, url, **kwargs):
        response = mock.Mock()
        if "resend" in url:
            response.raise_for_status.side_effect = requests.HTTPError("429 daily quota")
        else:
            response.raise_for_status.return_value = None
        return response

    def test_uses_resend_first_and_stops_there(self):
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            self.assertEqual(self._send(), 1)
        self.assertEqual(post.call_count, 1)
        self.assertIn("resend", post.call_args.args[0])

    def test_falls_back_to_brevo_when_resend_refuses(self):
        with mock.patch("apps.core.email_backend.requests.post", side_effect=self._refuse_resend) as post:
            self.assertEqual(self._send(), 1)
        self.assertEqual([c.args[0] for c in post.call_args_list], [
            "https://api.resend.com/emails",
            "https://api.brevo.com/v3/smtp/email",
        ])

    def test_raises_when_every_provider_fails(self):
        with mock.patch("apps.core.email_backend.requests.post", side_effect=requests.ConnectionError("down")):
            with self.assertRaises(requests.ConnectionError):
                self._send()
            self.assertEqual(self._send(fail_silently=True), 0)

    @override_settings(EMAIL_PROVIDER_ORDER="brevo,resend")
    def test_order_is_configurable(self):
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            self._send()
        self.assertIn("brevo", post.call_args.args[0])

    @override_settings(RESEND_API_KEY="")
    def test_works_with_only_brevo_configured(self):
        with mock.patch("apps.core.email_backend.requests.post") as post:
            post.return_value.raise_for_status.return_value = None
            self.assertEqual(self._send(), 1)
        self.assertIn("brevo", post.call_args.args[0])

    @override_settings(RESEND_API_KEY="", BREVO_API_KEY="")
    def test_with_no_keys_it_refuses_instead_of_pretending(self):
        with self.assertRaises(RuntimeError):
            self._send()
