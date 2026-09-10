from django.apps import AppConfig


class PaymentsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.payments'

    def ready(self):
        # Announce which gateway is live so an operator can never be surprised
        # by mock money in production (or vice versa).
        try:
            from .gateways import log_active_gateway

            log_active_gateway()
        except Exception:  # never let logging break app startup
            import logging

            logging.getLogger(__name__).exception("Could not resolve payment gateway")
