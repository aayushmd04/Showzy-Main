"""Forgiving URL and social-handle fields.

Django's URLField requires a scheme, so a musician typing `google.com` or
`myband.in` into a website box got "Enter a valid URL" for an address that is
obviously fine. Nobody types `https://`. This normalises instead of refusing.

Social handles are the mirror problem: the field wants `naada.live` but people
paste the whole profile URL, or include the `@`. All three forms are accepted
and stored as a bare handle.
"""

import re

from django.core.validators import URLValidator
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

# A bare host like "example.com" or "sub.example.co.in" — enough to tell a
# domain from a sentence, without trying to out-guess the URL validator after.
_BARE_HOST = re.compile(r"^[\w-]+(\.[\w-]+)+(/.*)?$", re.UNICODE)


class ForgivingURLField(serializers.CharField):
    """A URL field that adds the scheme a person didn't type."""

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("max_length", 300)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = str(super().to_internal_value(data)).strip()
        if not value:
            return ""

        # Someone pasting from a browser bar often brings a trailing slash and
        # occasionally a stray "www." with no scheme — both are fine.
        if "://" not in value:
            if not _BARE_HOST.match(value):
                raise serializers.ValidationError(
                    "That doesn't look like a web address. Something like "
                    "yourband.com or https://yourband.com works."
                )
            value = f"https://{value}"

        try:
            URLValidator(schemes=["http", "https"])(value)
        except DjangoValidationError:
            raise serializers.ValidationError(
                "That doesn't look like a web address. Something like "
                "yourband.com or https://yourband.com works."
            ) from None

        return value


class SocialHandleField(serializers.CharField):
    """Accept a handle, an @handle, or the full profile URL. Store the handle."""

    def __init__(self, *, platform: str = "", hosts=(), **kwargs):
        self.platform = platform
        self.hosts = tuple(hosts)
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("max_length", 80)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = str(super().to_internal_value(data)).strip()
        if not value:
            return ""

        # Full profile URL → take the first path segment.
        if "://" in value or any(h in value.lower() for h in self.hosts):
            path = re.sub(r"^[a-z]+://", "", value, flags=re.I)
            parts = [p for p in path.split("/")[1:] if p]
            value = parts[0] if parts else ""
            value = value.split("?")[0]

        value = value.lstrip("@").strip("/")

        if not value:
            raise serializers.ValidationError(
                f"Couldn't find a {self.platform or 'profile'} name in that. "
                "Paste your profile link or just the handle."
            )
        if not re.fullmatch(r"[\w.\-]{1,80}", value):
            raise serializers.ValidationError(
                "A handle can only use letters, numbers, dots, dashes and underscores."
            )
        return value


class IndianPhoneField(serializers.CharField):
    """Normalise a phone number to E.164 so one number is one value.

    The column is `unique=True` and documents E.164, but nothing enforced it —
    "+91 98450 11223", "9845011223" and "+91-98450-11223" all stored happily as
    three different strings for the same phone. Uniqueness was uniqueness of
    typing, not of number, so the same person could hold three accounts on one
    line and an organiser trying to reach a buyer got whichever spelling they
    happened to use.

    Accepts what people type — spaces, dashes, brackets, a leading zero, a bare
    ten digits — and stores +91XXXXXXXXXX. Numbers already in international
    form for other countries are kept as they are.
    """

    def __init__(self, **kwargs):
        kwargs.setdefault("required", False)
        kwargs.setdefault("allow_blank", True)
        kwargs.setdefault("allow_null", True)
        kwargs.setdefault("max_length", 20)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        raw = str(super().to_internal_value(data)).strip()
        if not raw:
            return ""

        digits = re.sub(r"[^\d+]", "", raw)
        plus = digits.startswith("+")
        digits = digits.lstrip("+")

        if not digits.isdigit():
            raise serializers.ValidationError("Enter a phone number, digits only.")

        # Another country's number, given in full — leave it alone.
        if plus and not digits.startswith("91"):
            if not 8 <= len(digits) <= 15:
                raise serializers.ValidationError("That number doesn't look right.")
            return f"+{digits}"

        if digits.startswith("91") and len(digits) == 12:
            local = digits[2:]
        elif digits.startswith("0") and len(digits) == 11:
            local = digits[1:]
        elif len(digits) == 10:
            local = digits
        else:
            raise serializers.ValidationError(
                "An Indian mobile number is 10 digits, like 98450 11223."
            )

        if local[0] not in "6789":
            raise serializers.ValidationError(
                "An Indian mobile number starts with 6, 7, 8 or 9."
            )
        return f"+91{local}"
