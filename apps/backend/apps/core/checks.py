"""Deployment checks that `manage.py check --deploy` will surface.

Django's own deploy checks cover the framework's settings. These cover the
handful of Showzy-specific ways a deploy can look healthy and quietly not be.
"""

from django.conf import settings
from django.core.checks import Warning as CheckWarning, register


@register(deploy=True)
def throttle_needs_a_shared_cache(app_configs, **kwargs):
    """Rate limits are only as real as the store counting them.

    DRF keeps throttle counters in the Django cache. With no REDIS_URL,
    production falls back to Django's default local-memory cache, which is
    per-process and empties on restart — so the "5 sign-in codes an hour" limit
    silently becomes five per worker per deploy. On a two-worker box that is
    already double, and a restart resets it to zero.

    Not an error: the app runs, and a single-worker box is genuinely fine.
    It just shouldn't be a surprise.
    """
    if settings.DEBUG:
        return []

    backend = settings.CACHES.get("default", {}).get("BACKEND", "")
    if "locmem" not in backend and "dummy" not in backend:
        return []

    return [
        CheckWarning(
            "Rate limiting has no shared cache to count in.",
            hint=(
                "Set REDIS_URL so CACHES points at Redis. Without it the OTP and "
                "API throttles count per worker process and reset on every "
                "restart, which is not the limit the settings appear to state."
            ),
            id="naada.W001",
        )
    ]


@register(deploy=True)
def email_must_actually_send(app_configs, **kwargs):
    """A console email backend in production means nobody can sign in.

    Sign-in is passwordless: the one-time code arrives by email and nowhere
    else. If the console backend is still selected, the code is written to the
    server log and the user is locked out of their own account, with no error
    anywhere to explain it.
    """
    if settings.DEBUG:
        return []

    if "console" not in settings.EMAIL_BACKEND and "dummy" not in settings.EMAIL_BACKEND:
        return []

    return [
        CheckWarning(
            "Sign-in codes are being printed to the log, not emailed.",
            hint=(
                "Set EMAIL_HOST_USER and EMAIL_HOST_PASSWORD (the mailbox login; "
                "DEPLOY.md, step B4). "
                "Until then every visitor who tries to sign in waits for a code "
                "that will never arrive — and there is no password to fall back on."
            ),
            id="naada.W002",
        )
    ]


@register(deploy=True)
def turnstile_should_be_on(app_configs, **kwargs):
    """Without the bot check, anyone can script sign-in-code requests.

    The throttles cap the damage per address and per caller, but not the
    breadth: a script walking a list of real addresses still sends each of them
    mail from our domain, which is how a sender's reputation is lost.
    """
    if settings.DEBUG or getattr(settings, "TURNSTILE_SECRET_KEY", ""):
        return []
    return [
        CheckWarning(
            "Turnstile is off: sign-in code requests have no bot check.",
            hint="Set TURNSTILE_SECRET_KEY and build the frontend with VITE_TURNSTILE_SITE_KEY.",
            id="naada.W004",
        )
    ]
