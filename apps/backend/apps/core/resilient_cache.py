"""A Redis cache that survives Redis going away.

Django's RedisCache raises on every call when Redis is unreachable, out of quota
or slow. Our rate limiters (sign-in codes, writes) live in that cache, so one
Redis outage used to turn every POST into a 500: nobody could sign in, even
though nothing the user asked for needed Redis.

This backend keeps working in that case:

* any error from Redis is caught and the same operation runs against a small
  in-process cache instead. Counters then live per process (weaker than a shared
  limit, but a limit nonetheless) and nothing returns an error;
* after a failure Redis is skipped for ``COOLDOWN`` seconds, so a dead Redis costs
  one slow call, not one per request;
* the first failure after a quiet spell is logged, not every one.

Redis is tried again automatically once the cool-down passes, so recovery needs
no restart.
"""

import logging
import time

from django.core.cache.backends.locmem import LocMemCache
from django.core.cache.backends.redis import RedisCache

logger = logging.getLogger(__name__)

#: Seconds to leave Redis alone after it fails.
COOLDOWN = 30

_WRAPPED = (
    "add", "get", "set", "touch", "delete", "get_many", "has_key",
    "incr", "decr", "set_many", "delete_many", "clear",
)


class ResilientRedisCache(RedisCache):
    def __init__(self, server, params):
        super().__init__(server, params)
        self._fallback = LocMemCache("naada-cache-fallback", {"TIMEOUT": params.get("TIMEOUT", 300)})
        self._down_until = 0.0

    # -- breaker ---------------------------------------------------------------
    def _tripped(self) -> bool:
        return time.monotonic() < self._down_until

    def _trip(self, exc: Exception) -> None:
        was_up = not self._tripped()
        self._down_until = time.monotonic() + COOLDOWN
        if was_up:
            logger.error(
                "Cache: Redis unavailable, using the in-process fallback for %ss (%s: %s)",
                COOLDOWN, exc.__class__.__name__, str(exc)[:160],
            )

    def _run(self, name, *args, **kwargs):
        if not self._tripped():
            try:
                return getattr(super(), name)(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 — any Redis failure means "use the fallback"
                self._trip(exc)
        return getattr(self._fallback, name)(*args, **kwargs)


def _make(name):
    def method(self, *args, **kwargs):
        return self._run(name, *args, **kwargs)

    method.__name__ = name
    return method


for _name in _WRAPPED:
    setattr(ResilientRedisCache, _name, _make(_name))
