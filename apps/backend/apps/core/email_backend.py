"""Send email over HTTPS (Resend, Brevo), for hosts that block the mail ports.

Render's free web services cannot reach SMTP ports 25, 465 or 587, so Django's normal SMTP
backend times out there and sign-in codes never arrive. Both providers take the same message
over plain HTTPS (port 443), which is never blocked.

Each free plan has a daily cap (Resend 100, Brevo 300), so `HttpsEmailBackend` tries the
providers in order and moves on to the next when one refuses or is down. It is chosen
automatically when RESEND_API_KEY and/or BREVO_API_KEY is set (see settings/base.py). Nothing
else in the app changes: it still calls send_mail / EmailMultiAlternatives.
"""

import logging
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)


def _html_of(message):
    html = ""
    for content, mimetype in getattr(message, "alternatives", []):
        if mimetype == "text/html":
            html = content
    return html


class _Provider(BaseEmailBackend):
    """One provider. `deliver` posts a single message and raises requests.RequestException."""

    name = ""
    key_setting = ""

    @property
    def key(self):
        return getattr(settings, self.key_setting, "")

    def deliver(self, message):
        raise NotImplementedError

    def _post(self, url, headers, payload):
        response = requests.post(url, json=payload, headers=headers, timeout=getattr(settings, "EMAIL_TIMEOUT", 8))
        response.raise_for_status()

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        if not self.key:
            if not self.fail_silently:
                raise RuntimeError(f"{self.key_setting} is not set")
            return 0
        sent = 0
        for message in email_messages:
            try:
                self.deliver(message)
            except requests.RequestException as exc:
                # Never log the body: sign-in codes travel in it.
                logger.error("%s email failed (%s): %s", self.name, type(exc).__name__, exc)
                if not self.fail_silently:
                    raise
                continue
            sent += 1
        return sent


class ResendEmailBackend(_Provider):
    name = "Resend"
    key_setting = "RESEND_API_KEY"

    def deliver(self, message):
        payload = {
            "from": message.from_email or settings.DEFAULT_FROM_EMAIL,
            "to": list(message.to),
            "subject": message.subject,
            "text": message.body,
        }
        if message.cc:
            payload["cc"] = list(message.cc)
        if message.bcc:
            payload["bcc"] = list(message.bcc)
        if message.reply_to:
            payload["reply_to"] = list(message.reply_to)
        if html := _html_of(message):
            payload["html"] = html
        self._post("https://api.resend.com/emails", {"Authorization": f"Bearer {self.key}"}, payload)


class BrevoEmailBackend(_Provider):
    name = "Brevo"
    key_setting = "BREVO_API_KEY"

    @staticmethod
    def _person(address):
        name, email = parseaddr(address)
        return {"email": email, **({"name": name} if name else {})}

    def deliver(self, message):
        payload = {
            "sender": self._person(message.from_email or settings.DEFAULT_FROM_EMAIL),
            "to": [self._person(a) for a in message.to],
            "subject": message.subject,
            "textContent": message.body,
        }
        if message.cc:
            payload["cc"] = [self._person(a) for a in message.cc]
        if message.bcc:
            payload["bcc"] = [self._person(a) for a in message.bcc]
        if message.reply_to:
            payload["replyTo"] = self._person(message.reply_to[0])
        if html := _html_of(message):
            payload["htmlContent"] = html
        self._post("https://api.brevo.com/v3/smtp/email", {"api-key": self.key}, payload)


_PROVIDERS = {"resend": ResendEmailBackend, "brevo": BrevoEmailBackend}


class HttpsEmailBackend(BaseEmailBackend):
    """Tries each configured provider in EMAIL_PROVIDER_ORDER until one accepts the message."""

    def _providers(self):
        order = [n.strip().lower() for n in getattr(settings, "EMAIL_PROVIDER_ORDER", "resend,brevo").split(",")]
        found = [_PROVIDERS[n](fail_silently=False) for n in order if n in _PROVIDERS]
        return [p for p in found if p.key]

    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        providers = self._providers()
        if not providers:
            if not self.fail_silently:
                raise RuntimeError("Neither RESEND_API_KEY nor BREVO_API_KEY is set")
            return 0
        sent = 0
        for message in email_messages:
            error = None
            for provider in providers:
                try:
                    provider.send_messages([message])
                except requests.RequestException as exc:
                    error = exc  # already logged by the provider; try the next one
                    continue
                sent += 1
                error = None
                break
            if error is not None and not self.fail_silently:
                raise error
        return sent
