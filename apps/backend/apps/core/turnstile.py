"""Cloudflare Turnstile verification (server side).

The widget in the browser only produces a token. It proves nothing until we
ask Cloudflare whether the token is genuine, unused and for our site, which
is what this does. Tokens are single-use and expire after 5 minutes.

Fail policy: an explicit "no" from Cloudflare always rejects. If Cloudflare
itself cannot be reached we let the request through and log it, because the
alternative is that a Cloudflare blip locks every user out of sign-in; the
cooldown and per-address / per-IP / verify throttles still apply either way.
"""

import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
ACTION = "request-otp"
MAX_TOKEN_LENGTH = 2048  # Cloudflare's documented ceiling


def enabled() -> bool:
    return bool(getattr(settings, "TURNSTILE_SECRET_KEY", ""))


def verify(token: str, ip: str | None = None, action: str = ACTION) -> bool:
    """True if this request may proceed.

    With no secret configured (local dev, tests) verification is off and this
    returns True; ``manage.py check --deploy`` warns about that in production.
    """
    if not enabled():
        return True
    if not isinstance(token, str) or not token or len(token) > MAX_TOKEN_LENGTH:
        return False

    data = {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    if ip:
        data["remoteip"] = ip

    try:
        resp = requests.post(
            SITEVERIFY_URL,
            data=data,
            timeout=getattr(settings, "TURNSTILE_TIMEOUT", 3),
            allow_redirects=False,
        )
        body = resp.json()
    except (requests.RequestException, ValueError) as exc:
        # Class name only; never the secret or token.
        logger.error("Turnstile siteverify unreachable (%s); letting request through", type(exc).__name__)
        return True

    if not isinstance(body, dict):
        logger.error("Turnstile siteverify returned a non-object; letting request through")
        return True
    if not body.get("success"):
        logger.info("Turnstile rejected a token: %s", body.get("error-codes"))
        return False

    # A token minted for another widget action (say, a different form on our
    # own site) must not unlock this one. Only checked when Cloudflare says.
    returned = body.get("action")
    if returned and returned != action:
        logger.info("Turnstile token was for action %r, expected %r", returned, action)
        return False

    allowed = getattr(settings, "TURNSTILE_ALLOWED_HOSTNAMES", [])
    hostname = body.get("hostname")
    if allowed and hostname and hostname not in allowed:
        logger.info("Turnstile token was issued on hostname %r", hostname)
        return False
    return True
