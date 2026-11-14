"""Recording that someone looked at an event.

Every event-page view used to insert a row (with IP and user agent) before the
page could be served: a database write on the site's hottest read, and a refresh
loop or a crawler could add thousands of identical rows. A viewer is now counted
once per event per ten minutes, decided in this process's memory, so the common
case costs no database work at all.
"""

from django.core.cache.backends.locmem import LocMemCache

from .models import EventView

#: One view per viewer per event per this many seconds.
WINDOW = 600

_seen = LocMemCache("naada-event-views", {"TIMEOUT": WINDOW, "OPTIONS": {"MAX_ENTRIES": 20000}})


def record_event_view(request, event_id) -> bool:
    """Insert a view row unless this viewer was already counted recently. Returns whether it did."""
    user = request.user if getattr(request, "user", None) and request.user.is_authenticated else None
    who = f"u{user.pk}" if user else f"ip{request.META.get('REMOTE_ADDR', '')}"
    if not _seen.add(f"{event_id}:{who}", 1, WINDOW):
        return False
    try:
        EventView.objects.create(
            event_id=event_id,
            user=user,
            ip_address=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT", "")[:300],
            referrer=request.META.get("HTTP_REFERER", "")[:200],
        )
    except Exception:  # noqa: BLE001 — analytics must never break the page
        return False
    return True


def reset() -> None:
    """For tests."""
    _seen.clear()
