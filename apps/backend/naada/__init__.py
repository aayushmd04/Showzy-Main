"""Naada project package.

Importing the Celery app here guarantees that ``@shared_task`` decorators use
this app when Django starts, so scheduled/queued jobs actually run.
"""

from .celery import app as celery_app

__all__ = ("celery_app",)
