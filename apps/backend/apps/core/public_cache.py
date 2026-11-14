"""A short in-memory cache for what a signed-out visitor can see.

Every visitor to the home page asks for the same events, artists, venues, genres
and cities. Answering each from the database means the busiest page on the site
costs a database round trip per visitor per list. This answers repeats from the
process's own memory for a few seconds instead.

It is deliberately narrow, because a shared cache that gets one thing wrong shows
one person's data to another:

* only GET, only 200, only the allow-listed public paths below;
* **only requests with no Authorization header.** A signed-in response can differ
  by viewer (a host sees an artist's fees; "is_saved", "is_following"), so those
  never enter or leave this cache;
* the cache key is the full path and query string;
* the cache lives in each process's memory (not Redis: it must keep working when
  Redis is down or over quota, and shouldn't spend Redis commands on reads).

Event pages are cached too, but a view is still recorded on every request (the
recorder de-duplicates, see apps.events.analytics), so the stats don't go quiet.

Cached answers also carry `Cache-Control: public, max-age=…` so browsers (and a
CDN, if one is ever put in front) reuse them without asking at all.
"""

import re

from django.conf import settings
from django.core.cache.backends.locmem import LocMemCache
from django.utils.cache import patch_cache_control

#: Seconds a public answer is reused when PUBLIC_READ_CACHE_TTL isn't set. Short
#: enough that a new event, a sell-out or an edited profile shows up within a
#: minute; long enough to absorb a rush. 0 turns the cache off (local development
#: and the test suite, where you want every edit to show at once).
DEFAULT_TTL = 30


def _ttl() -> int:
    return int(getattr(settings, "PUBLIC_READ_CACHE_TTL", DEFAULT_TTL))

_UUID = r"[0-9a-fA-F-]{36}"
_PUBLIC = re.compile(
    r"^/api/v1/(?:"
    r"events/|artists/|venues/|genres/|cities/|areas/|site-config/"
    rf"|artists/{_UUID}/|venues/[-\w]+/|events/{_UUID}/"
    r")$"
)
_EVENT_DETAIL = re.compile(rf"^/api/v1/events/({_UUID})/$")

_store = LocMemCache("naada-public-reads", {"TIMEOUT": DEFAULT_TTL, "OPTIONS": {"MAX_ENTRIES": 500}})


class PublicReadCacheMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not self._eligible(request):
            return self.get_response(request)

        key = "pub:" + request.get_full_path()
        cached = _store.get(key)
        if cached is not None:
            self._record_view(request)
            response = self._rebuild(cached)
            response["X-Cache"] = "HIT"
            return response

        response = self.get_response(request)
        if response.status_code == 200 and not getattr(response, "streaming", False):
            response.render() if hasattr(response, "render") else None
            ttl = _ttl()
            _store.set(key, (response.content, response.get("Content-Type", "application/json")), ttl)
            patch_cache_control(response, public=True, max_age=ttl)
            response["X-Cache"] = "MISS"
        return response

    @staticmethod
    def _eligible(request) -> bool:
        if _ttl() <= 0 or request.method != "GET":
            return False
        # Anything that identifies a viewer: a bearer token, or a session cookie.
        if request.META.get("HTTP_AUTHORIZATION") or "sessionid" in request.COOKIES:
            return False
        path = request.path
        if not _PUBLIC.match(path):
            return False
        # `?mine=true` is the signed-in host's own list under a public-looking path.
        return "mine" not in request.GET

    @staticmethod
    def _record_view(request) -> None:
        match = _EVENT_DETAIL.match(request.path)
        if match:
            from apps.events.analytics import record_event_view

            record_event_view(request, match.group(1))

    @staticmethod
    def _rebuild(cached):
        from django.http import HttpResponse

        content, content_type = cached
        response = HttpResponse(content, content_type=content_type)
        patch_cache_control(response, public=True, max_age=_ttl())
        return response


def clear() -> None:
    """For tests."""
    _store.clear()
