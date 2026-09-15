from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.core'

    def ready(self):
        # Importing registers the @register(deploy=True) checks in checks.py.
        from . import checks  # noqa: F401
