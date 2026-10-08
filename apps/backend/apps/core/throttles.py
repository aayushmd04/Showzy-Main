"""Default API throttles.

Browsing must never be throttled. One page of the site makes a dozen or so
read requests, and people on the same mobile network share one IP address, so
a per-IP limit on reads locks real visitors out within a few page loads. That
is the opposite of what a throttle is for.

These classes therefore count only requests that change something. Reads pass
straight through. The expensive and abusable writes keep their own, much
stricter, scoped throttles (see ``OTPRateThrottle`` / ``OTPEmailThrottle`` in
``apps/users/views.py``).
"""

from rest_framework.permissions import SAFE_METHODS
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle


class WriteAnonThrottle(AnonRateThrottle):
    """Anonymous callers: count writes only."""

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)


class WriteUserThrottle(UserRateThrottle):
    """Signed-in callers: count writes only."""

    def allow_request(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        return super().allow_request(request, view)
