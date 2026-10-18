"""Django email backend for Cloudflare Email Sending (REST API).

Why REST and not SMTP: Cloudflare's SMTP endpoint only speaks implicit TLS on
465, while Django here is set up for STARTTLS on 587, and several PaaS hosts
block outbound SMTP ports altogether. HTTPS on 443 is open everywhere.

Two rules this backend holds to, because sign-in codes pass through it:

* One recipient per message. Showzy never mails a group; a message with two
  recipients is a bug (or an injection), so it fails loudly instead of sending.
* Nothing secret reaches a log line or an exception: not the API token, not the
  message body. Failures report the HTTP status and Cloudflare's error code.
"""

import logging
from email.utils import parseaddr

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

API_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/email/sending/send"


class EmailSendError(Exception):
    """The provider did not accept the message. ``str()`` is safe to log."""


def _address(value):
    """'Showzy <a@b.in>' -> {'address': 'a@b.in', 'name': 'Showzy'} (REST shape)."""
    name, addr = parseaddr(value)
    if not addr:
        raise EmailSendError("message has no usable address")
    return {"address": addr, "name": name} if name else addr


def _reject_newlines(*values):
    # Django already rejects these in headers; the REST body is JSON, so we
    # check ourselves rather than lean on a layer this backend bypasses.
    for value in values:
        if value and ("\n" in value or "\r" in value):
            raise EmailSendError("line break in a header field")


class CloudflareEmailBackend(BaseEmailBackend):
    def __init__(self, fail_silently=False, **kwargs):
        super().__init__(fail_silently=fail_silently, **kwargs)
        self.account_id = getattr(settings, "CLOUDFLARE_ACCOUNT_ID", "")
        self.token = getattr(settings, "CLOUDFLARE_EMAIL_TOKEN", "")
        self.timeout = getattr(settings, "EMAIL_TIMEOUT", 8)
        self.default_reply_to = getattr(settings, "EMAIL_REPLY_TO", "")
        if not (self.account_id and self.token):
            raise ImproperlyConfigured(
                "CloudflareEmailBackend needs CLOUDFLARE_ACCOUNT_ID and "
                "CLOUDFLARE_EMAIL_TOKEN."
            )

    # ── payload ────────────────────────────────────────────────────────────
    def build_payload(self, message):
        recipients = message.recipients()
        if len(recipients) != 1:
            raise EmailSendError(f"expected exactly one recipient, got {len(recipients)}")
        if message.attachments:
            raise EmailSendError("attachments are not supported by this backend")

        from_email = message.from_email or settings.DEFAULT_FROM_EMAIL
        _reject_newlines(message.subject, from_email, recipients[0])

        payload = {
            "to": recipients[0],
            "from": _address(from_email),
            "subject": message.subject,
        }

        html = next(
            (content for content, mimetype in getattr(message, "alternatives", [])
             if mimetype == "text/html"),
            None,
        )
        if message.content_subtype == "html":
            html, text = message.body, None
        else:
            text = message.body
        if text:
            payload["text"] = text
        if html:
            payload["html"] = html
        if "text" not in payload and "html" not in payload:
            raise EmailSendError("message has no body")

        reply_to = (message.reply_to or [self.default_reply_to])[0]
        if reply_to:
            _reject_newlines(reply_to)
            payload["reply_to"] = _address(reply_to)

        extra = {
            k: v for k, v in (message.extra_headers or {}).items()
            if k.lower() not in {"from", "to", "cc", "bcc", "subject", "reply-to"}
        }
        if extra:
            for k, v in extra.items():
                _reject_newlines(k, str(v))
            payload["headers"] = {k: str(v) for k, v in extra.items()}
        return payload

    # ── transport ──────────────────────────────────────────────────────────
    def _post(self, payload):
        try:
            resp = requests.post(
                API_URL.format(account_id=self.account_id),
                json=payload,
                headers={"Authorization": f"Bearer {self.token}"},
                timeout=self.timeout,
                allow_redirects=False,
            )
        except requests.RequestException as exc:
            # Class name only: the message of a requests error can embed the URL.
            raise EmailSendError(f"request failed: {type(exc).__name__}") from None

        try:
            body = resp.json()
        except ValueError:
            body = {}

        if resp.status_code != 200 or not body.get("success"):
            codes = [e.get("code") for e in (body.get("errors") or []) if isinstance(e, dict)]
            raise EmailSendError(f"Cloudflare returned HTTP {resp.status_code}, error codes {codes}")
        return body.get("result") or {}

    def send_messages(self, email_messages):
        sent = 0
        for message in email_messages:
            try:
                payload = self.build_payload(message)
                result = self._post(payload)
                if result.get("permanent_bounces"):
                    raise EmailSendError("recipient permanently bounced or is suppressed")
            except EmailSendError:
                if not self.fail_silently:
                    raise
                logger.warning("Email not sent (fail_silently)", exc_info=True)
                continue
            sent += 1
        return sent
