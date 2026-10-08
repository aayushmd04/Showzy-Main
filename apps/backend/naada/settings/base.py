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
    # Naada apps
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
        "otp": "5/hour",
        "otp_email": "5/hour",
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# ── API schema / docs (drf-spectacular) ───────────────────────────────────────
SPECTACULAR_SETTINGS = {
    "TITLE": "Naada API",
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
# Auto-detects SMTP vs console backend: if EMAIL_HOST_USER is set in .env, use real
# SMTP; otherwise fall back to console (dev mode — OTP appears in server terminal).
EMAIL_HOST = config("EMAIL_HOST", default="smtp.gmail.com")
EMAIL_PORT = config("EMAIL_PORT", default=587, cast=int)
EMAIL_USE_TLS = config("EMAIL_USE_TLS", default=True, cast=bool)
EMAIL_HOST_USER = config("EMAIL_HOST_USER", default="")
EMAIL_HOST_PASSWORD = config("EMAIL_HOST_PASSWORD", default="")
DEFAULT_FROM_EMAIL = config("DEFAULT_FROM_EMAIL", default="Naada <noreply@naada.live>")
_smtp_configured = bool(EMAIL_HOST_USER and EMAIL_HOST_PASSWORD)
EMAIL_BACKEND = config(
    "EMAIL_BACKEND",
    default=(
        "django.core.mail.backends.smtp.EmailBackend"
        if _smtp_configured
        else "django.core.mail.backends.console.EmailBackend"
    ),
)

# ── Razorpay ─────────────────────────────────────────────────────────────────
RAZORPAY_KEY_ID = config("RAZORPAY_KEY_ID", default="rzp_test_placeholder")
RAZORPAY_KEY_SECRET = config("RAZORPAY_KEY_SECRET", default="placeholder_secret")

# ── Ticketing economics ───────────────────────────────────────────────────────
# Per-ticket booking fee, in rupees. The event page and the checkout summary
# both render whatever this produces, so display and charge cannot drift.
# Set to 0 to sell at face value.
CONVENIENCE_FEE = config("CONVENIENCE_FEE", default=19, cast=int)

# ── Operator details shown on the public policy pages ────────────────────────
# Blank by default. Until these are filled in, the policy pages say so plainly,
# because a payment gateway rejects an application whose policies still read
# "[Company]". Set them here rather than editing the frontend source.
SITE_NAME = config("SITE_NAME", default="Naada")
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
#   GST_RATE_FEE          — % on Naada's booking fee (a service we supply)
#   GST_RATE_TICKET       — % on ticket face value (the organiser's supply)
#   GST_TICKET_EXEMPT_BELOW — per-ticket price under which tickets are exempt
GST_RATE_FEE = config("GST_RATE_FEE", default=0, cast=float)
GST_RATE_TICKET = config("GST_RATE_TICKET", default=0, cast=float)
GST_TICKET_EXEMPT_BELOW = config("GST_TICKET_EXEMPT_BELOW", default=0, cast=float)
GSTIN = config("GSTIN", default="")

# ── OTP settings ─────────────────────────────────────────────────────────────
OTP_LENGTH = config("OTP_LENGTH", default=6, cast=int)
OTP_EXPIRY_MINUTES = config("OTP_EXPIRY_MINUTES", default=10, cast=int)
OTP_MAX_ATTEMPTS = config("OTP_MAX_ATTEMPTS", default=5, cast=int)

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
