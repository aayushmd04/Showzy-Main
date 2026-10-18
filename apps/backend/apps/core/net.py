"""Who is actually calling us.

``X-Forwarded-For`` is a list each proxy appends to; everything the *client*
put in it sits on the left and is theirs to forge. Reading the first value, as
this code used to, lets one caller present a new fake address on every request
and walk straight past any per-IP throttle.

Trust only what our own infrastructure wrote:

* ``CLIENT_IP_HEADER`` — a header set by an edge we control (``CF-Connecting-IP``
  once the API is only reachable through Cloudflare). Leave empty until the
  origin is locked down, otherwise anyone hitting the origin directly can forge it.
* otherwise the entry ``TRUSTED_PROXY_COUNT`` places from the right of
  ``X-Forwarded-For`` — 1 on Render alone, 2 with Cloudflare in front of it.
"""

from django.conf import settings


def get_client_ip(request):
    meta = request.META

    header = getattr(settings, "CLIENT_IP_HEADER", "")
    if header:
        value = meta.get("HTTP_" + header.upper().replace("-", "_"), "").strip()
        if value:
            return value

    forwarded = meta.get("HTTP_X_FORWARDED_FOR", "")
    hops = [h.strip() for h in forwarded.split(",") if h.strip()]
    count = max(1, getattr(settings, "TRUSTED_PROXY_COUNT", 1))
    if len(hops) >= count:
        return hops[-count]

    return meta.get("REMOTE_ADDR")
