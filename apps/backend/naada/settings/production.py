"""Production settings.

Select with::

    DJANGO_ENV=naada.settings.production gunicorn naada.wsgi:application
    DJANGO_ENV=naada.settings.production daphne naada.asgi:application

Required env vars: SECRET_KEY, DATABASE_URL, ALLOWED_HOSTS.
Optional: REDIS_URL, SENTRY_DSN, AWS_* (see .env.example).
"""

from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import BASE_DIR, DATABASES, MIDDLEWARE, config  # noqa: F401

DEBUG = False

# ── Database ──────────────────────────────────────────────────────────────────
# Inherited verbatim from base.py, which parses DATABASE_URL (Supabase gives a
# single connection URL) and applies sslmode=require + CONN_MAX_AGE. Nothing to
# redeclare here — set DATABASE_URL in the environment.
#
# Fail loudly at boot rather than silently running against dev SQLite.
if DATABASES["default"]["ENGINE"].endswith("sqlite3"):
    raise ImproperlyConfigured(
        "DATABASE_URL must point at Postgres in production "
        "(e.g. postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres)."
    )

# SECRET_KEY must be a real secret — refuse to boot on anything recognisably
# not one. Checking only the "django-insecure" prefix let the placeholder that
# ships in .env ("change-me-in-production-...") sail straight through, which is
# exactly the value most likely to reach a first deploy.
_secret = SECRET_KEY  # noqa: F405
_looks_placeholder = (
    _secret.startswith("django-insecure")
    or "change-me" in _secret.lower()
    or "changeme" in _secret.lower()
    or "your-secret" in _secret.lower()
    or len(_secret) < 40
)
if _looks_placeholder:
    raise ImproperlyConfigured(  # noqa: F405
        "SECRET_KEY looks like a placeholder. Generate a real one and set it in the "
        "environment:\n"
        "  python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

# ── Payments ──────────────────────────────────────────────────────────────────
# The mock gateway signs its own "payments", so on a public site any signed-in
# user can mint a valid payment for their own order and be issued tickets for
# nothing. It used to be the silent default here: forget PAYMENT_GATEWAY on launch
# day and real events sold free tickets with no error anywhere. Production now
# refuses to boot on it unless somebody opts in on purpose (ALLOW_MOCK_PAYMENTS),
# which is for pre-launch demos with no real money at stake.
PAYMENT_GATEWAY = config("PAYMENT_GATEWAY", default="mock").strip().lower()
ALLOW_MOCK_PAYMENTS = config("ALLOW_MOCK_PAYMENTS", default=False, cast=bool)
if PAYMENT_GATEWAY != "razorpay" and not ALLOW_MOCK_PAYMENTS:
    raise ImproperlyConfigured(
        f"PAYMENT_GATEWAY={PAYMENT_GATEWAY!r} is not allowed in production: the mock gateway "
        "lets anyone issue themselves free tickets. Set PAYMENT_GATEWAY=razorpay with real "
        "RAZORPAY_* credentials, or, for a demo with no real money, set ALLOW_MOCK_PAYMENTS=true."
    )

if PAYMENT_GATEWAY == "mock":
    # The built-in mock secrets are public (they are in the source). Derive private
    # ones from SECRET_KEY so a stranger cannot forge a "payment" or a webhook.
    import hashlib as _hashlib

    def _derive(label):
        return _hashlib.sha256(f"{SECRET_KEY}:{label}".encode()).hexdigest()  # noqa: F405

    MOCK_PAYMENT_KEY_SECRET = config("MOCK_PAYMENT_KEY_SECRET", default="") or _derive("mock-payment-key")
    MOCK_PAYMENT_WEBHOOK_SECRET = (
        config("MOCK_PAYMENT_WEBHOOK_SECRET", default="") or _derive("mock-payment-webhook")
    )

# ── OTP ───────────────────────────────────────────────────────────────────────
# Never leak the OTP in an API response, regardless of what .env says.
OTP_DEBUG_RESPONSE = False

# ── Channels / Redis ──────────────────────────────────────────────────────────
REDIS_URL = config("REDIS_URL", default="")
if REDIS_URL:
    CHANNEL_LAYERS = {
        "default": {
            "BACKEND": "channels_redis.core.RedisChannelLayer",
            "CONFIG": {"hosts": [REDIS_URL]},
        }
    }
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.redis.RedisCache",
            "LOCATION": REDIS_URL,
        }
    }
# Without REDIS_URL the in-memory channel layer from base.py stays in place:
# single-process WebSockets only, but the app still boots.

# ── Static files (WhiteNoise) ─────────────────────────────────────────────────
# Must sit immediately after SecurityMiddleware.
if "whitenoise.middleware.WhiteNoiseMiddleware" not in MIDDLEWARE:
    MIDDLEWARE.insert(
        MIDDLEWARE.index("django.middleware.security.SecurityMiddleware") + 1,
        "whitenoise.middleware.WhiteNoiseMiddleware",
    )

# Compressed + hashed filenames, served straight from gunicorn/daphne.
STORAGES = {
    "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}
# Kept for any third-party code still reading the legacy setting (Django 5.1
# reads STORAGES, above).
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"
WHITENOISE_MAX_AGE = 31536000

# ── Media on S3 / Supabase Storage (django-storages), only if configured ──────
AWS_STORAGE_BUCKET_NAME = config("AWS_STORAGE_BUCKET_NAME", default="")
if AWS_STORAGE_BUCKET_NAME:
    AWS_ACCESS_KEY_ID = config("AWS_ACCESS_KEY_ID", default="")
    AWS_SECRET_ACCESS_KEY = config("AWS_SECRET_ACCESS_KEY", default="")
    AWS_S3_REGION_NAME = config("AWS_S3_REGION_NAME", default="ap-south-1")
    AWS_S3_ENDPOINT_URL = config("AWS_S3_ENDPOINT_URL", default="") or None
    AWS_S3_CUSTOM_DOMAIN = config("AWS_S3_CUSTOM_DOMAIN", default="") or None
    AWS_QUERYSTRING_AUTH = config("AWS_QUERYSTRING_AUTH", default=False, cast=bool)
    AWS_DEFAULT_ACL = None
    AWS_S3_FILE_OVERWRITE = False
    AWS_S3_OBJECT_PARAMETERS = {"CacheControl": "max-age=86400"}
    STORAGES["default"] = {"BACKEND": "storages.backends.s3boto3.S3Boto3Storage"}
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f"https://{AWS_S3_CUSTOM_DOMAIN}/"

# ── Security headers ──────────────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_SSL_REDIRECT = config("SECURE_SSL_REDIRECT", default=True, cast=bool)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_REFERRER_POLICY = "same-origin"
# Most PaaS hosts terminate TLS at the edge and forward this header.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
CSRF_TRUSTED_ORIGINS = [
    o.strip() for o in config("CSRF_TRUSTED_ORIGINS", default="").split(",") if o.strip()
] or [o for o in CORS_ALLOWED_ORIGINS if o.startswith("https://")]  # noqa: F405

# ── Sentry (entirely optional — absent DSN means no-op, never a crash) ────────
SENTRY_DSN = config("SENTRY_DSN", default="")
if SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.django import DjangoIntegration
        from sentry_sdk.integrations.celery import CeleryIntegration

        sentry_sdk.init(
            dsn=SENTRY_DSN,
            integrations=[DjangoIntegration(), CeleryIntegration()],
            environment=config("SENTRY_ENVIRONMENT", default="production"),
            release=config("SENTRY_RELEASE", default=None),
            traces_sample_rate=config("SENTRY_TRACES_SAMPLE_RATE", default=0.1, cast=float),
            # Never ship PII (phone numbers, emails, OTPs) to a third party.
            send_default_pii=False,
        )
    except ImportError:  # pragma: no cover - sentry-sdk not installed
        import logging

        logging.getLogger(__name__).warning("SENTRY_DSN set but sentry-sdk is not installed.")
