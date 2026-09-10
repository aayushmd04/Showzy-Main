"""
Celery application for Naada.

Without this module the ``@shared_task`` functions in ``apps/bookings/tasks.py``
(auto_release_booking, kyc_nudge, nightly_reconciliation) are never registered
with a worker, which means escrowed artist payouts never auto-release.

Run the worker and beat scheduler with::

    celery -A naada worker -l info
    celery -A naada beat -l info
"""

import os

from celery import Celery

# Same resolution order as manage.py / wsgi.py / asgi.py: DJANGO_ENV holds the
# full settings module path, defaulting to local.
os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    os.getenv("DJANGO_ENV", "naada.settings.local"),
)

app = Celery("naada")

# All CELERY_* keys in Django settings become Celery config (broker_url, etc.).
app.config_from_object("django.conf:settings", namespace="CELERY")

# Pick up tasks.py from every app in INSTALLED_APPS.
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Trivial task used to confirm the worker is alive: ``debug_task.delay()``."""
    print(f"Request: {self.request!r}")
