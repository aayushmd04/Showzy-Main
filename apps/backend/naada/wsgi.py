"""
WSGI config for naada project.

It exposes the WSGI callable as a module-level variable named ``application``.

The settings module is chosen by the ``DJANGO_ENV`` environment variable, e.g.::

    DJANGO_ENV=naada.settings.production gunicorn naada.wsgi:application

Defaults to ``naada.settings.local`` so local dev needs no env var.
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault(
    "DJANGO_SETTINGS_MODULE",
    os.getenv("DJANGO_ENV", "naada.settings.local"),
)

application = get_wsgi_application()
