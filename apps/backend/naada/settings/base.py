import os
from pathlib import Path
from urllib.parse import urlparse

import dj_database_url
from decouple import config

BASE_DIR = Path(__file__).resolve().parent.parent.parent

SECRET_KEY = config("SECRET_KEY", default="django-insecure-local-dev-only-change-in-production")
DEBUG = config("DEBUG", default=True, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1").split(",")

# ── Installed apps ────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "daphne",  # must be first — replaces runserver with ASGI
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "channels",
    "drf_spectacular",
    # Showzy apps
    "apps.core",
    "apps.users",
    "apps.venues",
    "apps.artists",
    "apps.events",
    "apps.tickets",
    "apps.payments",
    "apps.chat",
    "apps.notifications",
    "apps.bookings",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "naada.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ── ASGI / Channels ───────────────────────────────────────────────────────────
ASGI_APPLICATION = "naada.asgi.application"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels.layers.InMemoryChannelLayer",  # local dev
        # Swap to Redis in production:
        # "BACKEND": "channels_redis.core.RedisChannelLayer",
        # "CONFIG": {"hosts": [config("REDIS_URL", default="redis://localhost:6379/0")]},
    }
}

# ── Database ──────────────────────────────────────────────────────────────────
# One DATABASE_URL drives every environment. Defaults to the local SQLite file
# so dev behaviour is unchanged when the var is absent.
#
#   local     sqlite:///.../apps/backend/db.sqlite3
#   Supabase  postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres
#   direct    postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres
#
# Port 6543 is Supabase's pgbouncer pooler (transaction mode): persistent
# connections and server-side cursors must be off there. Port 5432 is a direct
# connection and keeps CONN_MAX_AGE + health checks.
DEFAULT_SQLITE_URL = f"sqlite:///{BASE_DIR / 'db.sqlite3'}"
DATABASE_URL = config("DATABASE_URL", default=DEFAULT_SQLITE_URL)

_db_url = urlparse(DATABASE_URL)
_db_is_sqlite = _db_url.scheme.lower().startswith("sqlite")
# Supabase's transaction pooler runs on 6543; override with DB_POOLED if needed.
_db_pooled = config("DB_POOLED", default=(_db_url.port == 6543), cast=bool)

if _db_is_sqlite:
    DATABASES = {"default": dj_database_url.parse(DATABASE_URL)}
    # "sqlite:///db.sqlite3" yields a cwd-relative name; anchor it to BASE_DIR so
    # the same file is used no matter where manage.py / gunicorn is launched from.
    _sqlite_name = str(DATABASES["default"].get("NAME") or "")
    if _sqlite_name and _sqlite_name != ":memory:" and not os.path.isabs(_sqlite_name):
        DATABASES["default"]["NAME"] = str(BASE_DIR / _sqlite_name)
else:
    DATABASES = {
        "default": dj_database_url.parse(
            DATABASE_URL,
            conn_max_age=0 if _db_pooled else config("DB_CONN_MAX_AGE", default=60, cast=int),
            conn_health_checks=not _db_pooled,
            disable_server_side_cursors=_db_pooled,
            ssl_require=True,  # Supabase rejects non-TLS connections
        )
    }
    # ssl_require already sets this; make it explicit and overridable.
    DATABASES["default"].setdefault("OPTIONS", {})
    DATABASES["default"]["OPTIONS"]["sslmode"] = config("DB_SSLMODE", default="require")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ── Custom user model ─────────────────────────────────────────────────────────
AUTH_USER_MODEL = "users.User"

# ── Auth password validators ──────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ── Internationalization ──────────────────────────────────────────────────────
LANGUAGE_CODE = "en-us"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = True
USE_TZ = True

# ── Static & Media ────────────────────────────────────────────────────────────
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = config("MEDIA_URL", default="/media/")
MEDIA_ROOT = BASE_DIR / config("MEDIA_ROOT", default="media")

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    # Reads are never throttled (see apps/core/throttles.py). These rates cap
    # writes only; the sign-in endpoint has its own stricter scopes below.
    "DEFAULT_THROTTLE_CLASSES": [
        "apps.core.throttles.WriteAnonThrottle",
        "apps.core.throttles.WriteUserThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "600/hour",
        "user": "5000/hour",
        # "otp" is per caller IP, "otp_email" is per recipient address. Both
        # apply to the sign-in endpoint; see apps/users/views.py for why one
        # without the other leaves a hole.
        "otp": "10/hour",
        "otp_email": "5/hour",
        "otp_email_day": "10/day",
        # Redeeming a code: per caller IP and per address. Per-token attempts
        # are capped separately, but asking for a fresh code resets that cap.
        "otp_verify": "20/hour",
        "otp_verify_email": "10/hour",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# ── API schema / docs (drf-spectacular) ───────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Showzy API",
    "DESCRIPTION": "Live-music events, ticketing and artist bookings for Mysuru & Bengaluru.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
    "SCHEMA_PATH_PREFIX": "/api/v1",
    "COMPONENT_SPLIT_REQUEST": True,
    "SORT_OPERATIONS": False,
    "SERVE_PERMISSIONS": ["rest_framework.permissions.AllowAny"],
    "SWAGGER_UI_SETTINGS": {"persistAuthorization": True, "displayRequestDuration": True},
}

# drf-spectacular emits ~56 documentation-quality warnings against the existing
# views: W002 for every @api_view whose serializer it cannot infer, W001 for
# SerializerMethodFields with no return type hint. The schema still generates
# (those fields fall back to `string`), but the noise buries the real security
# findings in `manage.py check --deploy`. Drop these once the function-based
# views carry @extend_schema / @extend_schema_field decorators.
SILENCED_SYSTEM_CHECKS = ["drf_spectacular.W001", "drf_spectacular.W002"]

# ── JWT ───────────────────────────────────────────────────────────────────────
from datetime import timedelta

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=60),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "UPDATE_LAST_LOGIN": True,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "USER_ID_FIELD": "id",
    "USER_ID_CLAIM": "user_id",
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS",
    default="http://localhost:5173,http://localhost:3000",
).split(",")
CORS_ALLOW_CREDENTIALS = True

# Used to build absolute links in outgoing email (ticket pages, receipts).
FRONTEND_URL = config("FRONTEND_URL", default="http://localhost:5173").rstrip("/")

# ── Email ─────────────────────────────────────────────────────────────────────
# Sent through the GoDaddy/Titan mailbox over SMTP, the same mailbox that
# receives replies. If EMAIL_HOST_USER and EMAIL_HOST_PASSWORD are set, real
# SMTP is used; otherwise messages (including OTPs) print to the server terminal.
#
# Port 465 needs EMAIL_USE_SSL=True; port 587 needs EMAIL_USE_TLS=True (default).
# Django refuses to start if both are on, so TLS defaults off when SSL is on.
# Host: take it from GoDaddy → Email → Server settings (smtp.titan.email for
# Titan, smtpout.secureserver.net for GoDaddy's own Workspace Email).
EMAIL_HOST = config("EMAIL_HOST", default="smtp.titan.email")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_SSL = config("EMAIL_USE_SSL", default=False, cast=bool)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=not EMAIL_USE_SSL, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
# Bound on how long the mail server can hold up a request.
EMAIL_TIMEOUT = config("EMAIL_TIMEOUT", default=8, cast=int)

# One sender per kind of mail. They are aliases on the mailbox, so replies to
# any of them land in its inbox. `or`, not a default alone: render.yaml ships
# these as "", and an empty string is a *present* value, so decouple would hand
# back "" and every message would go out with no sender. If the mail server
# insists on the login address as sender, set all three to the mailbox itself.
EMAIL_FROM_AUTH = config("EMAIL_FROM_AUTH", default="") or "Showzy <auth@showzy.in>"
EMAIL_FROM_TICKETS = config("EMAIL_FROM_TICKETS", default="") or "Showzy Tickets <tickets@showzy.in>"
EMAIL_FROM_ALERTS = config("EMAIL_FROM_ALERTS", default="") or "Showzy <alerts@showzy.in>"
# Fallback for anything that doesn't pick a sender.
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="") or EMAIL_FROM_ALERTS

# Email over HTTPS (Resend). Use this where the mail ports are blocked, e.g. Render's free
# plan. Set RESEND_API_KEY and verify the sending domain in Resend; it takes priority over SMTP.
RESEND_API_KEY = config("RESEND_API_KEY", default="")

_smtp_configured = bool(EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
if RESEND_API_KEY:
    _default_email_backend = "apps.core.email_backend.ResendEmailBackend"
elif _smtp_configured:
    _default_email_backend = "django.core.mail.backends.smtp.EmailBackend"
else:
    _default_email_backend = "django.core.mail.backends.console.EmailBackend"
EMAIL_BACKEND = config("EMAIL_BACKEND", default=_default_email_backend)

# ── Razorpay ─────────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID = config("RAZORPAY_KEY_ID", default="rzp_test_placeholder")
RAZORPAY_KEY_SECRET = config("RAZORPAY_KEY_SECRET", default="placeholder_secret")

# ── Ticketing economics ───────────────────────────────────────────────────────
# Per-ticket booking fee, in rupees. The event page and the checkout summary
# both render whatever this produces, so display and charge cannot drift.
# Set to 0 to sell at face value.
CONVENIENCE_FEE = config("CONVENIENCE_FEE", default=19, cast=int)

# ── Booking economics ────────────────────────────────────────────────────────
# Showzy's fee on an artist booking, as a fraction of the agreed fee (0.05 = 5%).
# The venue pays it ON TOP of the agreed fee, so the artist is never charged:
# they receive the agreed fee less TDS. The frontend shows the same number
# (PLATFORM_FEE_RATE in src/data/fixtures.ts); change both together.
PLATFORM_FEE_PCT = config("PLATFORM_FEE_PCT", default="0.05")

# ── Operator details shown on the public policy pages ────────────────────────
# Blank by default. Until these are filled in, the policy pages say so plainly,
# because a payment gateway rejects an application whose policies still read
# "[Company]". Set them here rather than editing the frontend source.
SITE_NAME = config("SITE_NAME", default="Showzy")
LEGAL_ENTITY_NAME = config("LEGAL_ENTITY_NAME", default="")
LEGAL_ENTITY_ADDRESS = config("LEGAL_ENTITY_ADDRESS", default="")
SUPPORT_EMAIL = config("SUPPORT_EMAIL", default="")
SUPPORT_PHONE = config("SUPPORT_PHONE", default="")
GRIEVANCE_OFFICER = config("GRIEVANCE_OFFICER", default="")
POLICIES_UPDATED = config("POLICIES_UPDATED", default="")

# ── GST ───────────────────────────────────────────────────────────────────────
# Zero by default, so nothing changes until a rate is set deliberately. The
# correct rate and treatment for event ticketing in India is a question for a
# CA; see apps/tickets/tax.py for what each of these does.
#
#   GST_RATE_FEE          — % on Showzy's booking fee (a service we supply)
#   GST_RATE_TICKET       — % on ticket face value (the organiser's supply)
#   GST_TICKET_EXEMPT_BELOW — per-ticket price under which tickets are exempt
GST_RATE_FEE = config("GST_RATE_FEE", default=0, cast=float)
GST_RATE_TICKET = config("GST_RATE_TICKET", default=0, cast=float)
GST_TICKET_EXEMPT_BELOW = config("GST_TICKET_EXEMPT_BELOW", default=0, cast=float)
GSTIN = config("GSTIN", default="")

# ── OTP settings ─────────────────────────────────────────────────────────────
OTP_LENGTH = config("OTP_LENGTH", default=6, cast=int)
OTP_EXPIRY_MINUTES = config("OTP_EXPIRY_MINUTES", default=3, cast=int)
OTP_MAX_ATTEMPTS = config("OTP_MAX_ATTEMPTS", default=5, cast=int)
# Minimum gap between two codes sent to the same address.
OTP_RESEND_COOLDOWN_SECONDS = config("OTP_RESEND_COOLDOWN_SECONDS", default=45, cast=int)
# Key for the HMAC that protects stored codes. Falls back to SECRET_KEY so
# nothing breaks if it is unset, but set it separately in production.
OTP_PEPPER = config("OTP_PEPPER", default="")

# ── Client IP (see apps/core/net.py) ─────────────────────────────────────────
# Header written by an edge we control. Empty until the API is reachable only
# through Cloudflare; then "CF-Connecting-IP".
CLIENT_IP_HEADER = config("CLIENT_IP_HEADER", default="")
# Proxies in front of Django that append to X-Forwarded-For. Render: 1.
TRUSTED_PROXY_COUNT = config("TRUSTED_PROXY_COUNT", default=1, cast=int)
# ── Cloudflare Turnstile (bot check on requesting a sign-in code) ────────────
# Secret key from Cloudflare dashboard → Turnstile. Empty = check is off.
# The matching *site* key is public and lives in the frontend build
# (VITE_TURNSTILE_SITE_KEY). Cloudflare publishes always-pass test keys
# (secret 1x0000000000000000000000000000000AA) for local work.
TURNSTILE_SECRET_KEY = config("TURNSTILE_SECRET_KEY", default="")
TURNSTILE_TIMEOUT = config("TURNSTILE_TIMEOUT", default=3, cast=int)
# Optional: only accept tokens issued on these hostnames (comma separated).
TURNSTILE_ALLOWED_HOSTNAMES = [
    h.strip() for h in config("TURNSTILE_ALLOWED_HOSTNAMES", default="").split(",") if h.strip()
]

# When True the OTP request endpoint echoes the generated code back in the JSON
# response so you can log in without a mail server. NEVER enable in production:
# it hands account takeover to anyone who knows a phone number / email.
# Deliberately independent of DEBUG — see local.py, which is the only place it
# is turned on.
OTP_DEBUG_RESPONSE = config("OTP_DEBUG_RESPONSE", default=False, cast=bool)

# ── Celery ────────────────────────────────────────────────────────────────────
CELERY_BROKER_URL = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = config("REDIS_URL", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_TIMEZONE = "Asia/Kolkata"

# Nightly reconciliation job — runs at 02:00 IST every day
CELERY_BEAT_SCHEDULE = {
    "nightly-reconciliation": {
        "task": "apps.bookings.tasks.nightly_reconciliation",
        "schedule": 86400,  # every 24h — use crontab(hour=2, minute=0) with django-celery-beat
    },
    # Checkouts hold seats for 15 minutes. Sweeping often keeps an abandoned
    # cart from making an event look sold out while the room is empty.
    "release-expired-ticket-orders": {
        "task": "apps.tickets.tasks.release_expired_orders",
        "schedule": 300,  # every 5 minutes
    },
    "purge-old-otp-tokens": {
        "task": "apps.users.tasks.purge_old_otp_tokens",
        "schedule": 86400,
    },
}

# ── Logging ───────────────────────────────────────────────────────────────────
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "{levelname} {asctime} {module} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "django": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "apps": {"handlers": ["console"], "level": "DEBUG", "propagate": False},
    },
}
