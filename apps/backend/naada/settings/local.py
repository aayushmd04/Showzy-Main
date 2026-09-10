from .base import *  # noqa

DEBUG = True

# Echo the generated OTP in the API response so local logins work without SMTP.
# Overridable via .env, but never inherited by production.py.
OTP_DEBUG_RESPONSE = config("OTP_DEBUG_RESPONSE", default=True, cast=bool)  # noqa: F405

# Show SQL queries in terminal during development
# Uncomment to debug slow queries:
# LOGGING["loggers"]["django.db.backends"] = {
#     "handlers": ["console"],
#     "level": "DEBUG",
#     "propagate": False,
# }

# Allow Django admin browseable API in local
REST_FRAMEWORK["DEFAULT_RENDERER_CLASSES"] = [
    "rest_framework.renderers.JSONRenderer",
    "rest_framework.renderers.BrowsableAPIRenderer",
]

# Relax throttling locally
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "anon": "1000/hour",
    "user": "10000/hour",
    "otp": "50/hour",
}
