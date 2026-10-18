"""Send email over HTTPS through Resend, for hosts that block the mail ports.

Render's free web services cannot reach SMTP ports 25, 465 or 587, so Django's normal SMTP
backend times out there and sign-in codes never arrive. Resend takes the same message over
plain HTTPS (port 443), which is never blocked.

Switched on by setting RESEND_API_KEY (see settings/base.py). Nothing else in the app changes:
it still calls send_mail / EmailMultiAlternatives and this class carries them out.
"""

import logging

import requests
from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

ENDPOINT = "https://api.resend.com/emails"


class ResendEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        key = getattr(settings, "RESEND_API_KEY", "")
        if not key:
            if not self.fail_silently:
                raise RuntimeError("RESEND_API_KEY is not set")
            return 0

        sent = 0
        for message in email_messages:
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
            for content, mimetype in getattr(message, "alternatives", []):
                if mimetype == "text/html":
                    payload["html"] = content
            try:
                response = requests.post(
                    ENDPOINT,
                    json=payload,
                    headers={"Authorization": f"Bearer {key}"},
                    timeout=getattr(settings, "EMAIL_TIMEOUT", 8),
                )
                response.raise_for_status()
            except requests.RequestException as exc:
                # Never log the body: sign-in codes travel in it.
                logger.error("Resend email failed (%s): %s", type(exc).__name__, exc)
                if not self.fail_silently:
                    raise
                continue
            sent += 1
        return sent
