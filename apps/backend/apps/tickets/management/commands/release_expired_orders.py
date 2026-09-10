from django.core.management.base import BaseCommand

from apps.tickets.tasks import release_expired_orders


class Command(BaseCommand):
    help = (
        "Return seats held by checkouts that were started but never paid for. "
        "Runs on Celery beat in production; this command exists so the same "
        "sweep can run from cron on a host without a worker."
    )

    def handle(self, *args, **options):
        count = release_expired_orders()
        self.stdout.write(
            self.style.SUCCESS(f"Released {count} expired order(s).")
            if count
            else "No expired orders to release."
        )
