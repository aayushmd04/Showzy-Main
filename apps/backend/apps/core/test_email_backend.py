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
