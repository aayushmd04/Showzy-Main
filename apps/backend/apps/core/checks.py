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


@register(deploy=True)
def mock_payments_must_be_deliberate(app_configs, **kwargs):
    """The mock gateway issues tickets for no money; say so on every deploy check."""
    if settings.DEBUG or getattr(settings, "PAYMENT_GATEWAY", "mock") == "razorpay":
        return []
    return [
        CheckWarning(
            "The MOCK payment gateway is live: anyone signed in can issue themselves free tickets.",
            hint=(
                "Set PAYMENT_GATEWAY=razorpay with real RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / "
                "RAZORPAY_WEBHOOK_SECRET, then remove ALLOW_MOCK_PAYMENTS. Acceptable only while "
                "no real money or real ticketed event is involved."
            ),
            id="naada.W005",
        )
    ]


def _is_local(url):
    return any(h in url for h in ("localhost", "127.0.0.1", "0.0.0.0"))


@register(deploy=True)
def public_urls_must_not_be_local(app_configs, **kwargs):
    """The two settings that quietly point a live site back at a laptop.

    FRONTEND_URL builds the links inside emails (tickets, receipts): left at its
    default, every email tells people to open http://localhost:5173.
    CORS_ALLOWED_ORIGINS lists the websites the browser may call this API from:
    left at its default, the live site loads but every request is blocked.
    """
    if settings.DEBUG:
        return []

    found = []
    if _is_local(settings.FRONTEND_URL):
        found.append(
            CheckWarning(
                "FRONTEND_URL still points at this computer, so email links will be broken.",
                hint="Set FRONTEND_URL to the public website address, e.g. https://showzy.in",
                id="naada.W006",
            )
        )
    origins = [o for o in settings.CORS_ALLOWED_ORIGINS if o.strip()]
    if not origins or all(_is_local(o) for o in origins):
        found.append(
            CheckWarning(
                "CORS_ALLOWED_ORIGINS only allows local addresses, so the live site cannot call this API.",
                hint="Set CORS_ALLOWED_ORIGINS to the website address, with https:// and no trailing slash.",
                id="naada.W007",
            )
        )
    return found
