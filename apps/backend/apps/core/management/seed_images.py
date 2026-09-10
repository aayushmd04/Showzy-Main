"""Seed imagery lookup for management commands.

The image files themselves live in the frontend and are served from its
``public/`` directory, so the browser fetches ``/media/<category>/<file>.jpg``
directly — Django never serves these bytes.

``MEDIA_URL`` defaults to ``/media/``, so storing the *relative* path
(``events/foo.jpg``) in an ``ImageField`` makes ``.url`` resolve to
``/media/events/foo.jpg``, which is exactly where the frontend serves the file
from. That is why these helpers return paths with the ``/media/`` prefix
stripped.

``manifest.json`` is the single source of truth for what exists and where it
came from. If it is missing (e.g. a backend-only checkout) every lookup returns
an empty list and callers simply skip imagery rather than failing.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

# .../apps/backend/apps/core/management/seed_images.py -> .../apps/
_APPS_DIR = Path(__file__).resolve().parents[4]
MANIFEST_PATH = _APPS_DIR / "frontend" / "public" / "media" / "manifest.json"

MEDIA_PREFIX = "/media/"


@lru_cache(maxsize=1)
def _manifest() -> dict:
    try:
        with MANIFEST_PATH.open(encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


@lru_cache(maxsize=None)
def category_images(category: str) -> tuple[tuple[str, str], ...]:
    """Return ``((relative_path, alt), ...)`` for a category, sorted by path.

    Sorting keeps the order stable across machines so seeded assignments are
    reproducible regardless of filesystem ordering.
    """
    images = _manifest().get("images") or {}
    rows = [
        (path[len(MEDIA_PREFIX):], entry.get("alt", ""))
        for path, entry in images.items()
        if entry.get("category") == category and path.startswith(MEDIA_PREFIX)
    ]
    rows.sort()
    return tuple(rows)


def pick(category: str, index: int) -> tuple[str, str] | tuple[None, None]:
    """Deterministically pick ``(relative_path, alt)`` for a row.

    ``index`` is any stable integer — a loop counter or primary key. The same
    index always yields the same image, so re-seeding does not shuffle posters.
    Returns ``(None, None)`` when the category has no images.
    """
    rows = category_images(category)
    if not rows:
        return (None, None)
    return rows[index % len(rows)]


def available() -> bool:
    """True when the manifest was found and has at least one image."""
    return bool(_manifest().get("images"))
