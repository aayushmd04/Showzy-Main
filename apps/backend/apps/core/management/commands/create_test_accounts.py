"""Create one signed-in-able account per role, for testing the real flows.

Naada has no passwords — sign-in is an emailed one-time code — so an account is
just an email address plus the right role. This makes four, one per role, and
prints them.

Idempotent: re-running updates roles rather than duplicating anyone.
"""

from django.core.management.base import BaseCommand, CommandError
from django.contrib.auth import get_user_model
from django.db import transaction

User = get_user_model()

ACCOUNTS = [
    ("listener@naada.test", "Test Listener", "attendee",
     "Browse, book a ticket, show the QR at a door."),
    ("artist@naada.test", "Test Artist", "artist",
     "Artist console: profile, gig board, offers, earnings."),
    ("host@naada.test", "Test Host", "venue_owner",
     "Host console: events, venue layout, door scanner, bookings."),
    ("admin@naada.test", "Test Admin", "admin",
     "Ops console: disputes, verification, ledger, flagged messages."),
]


class Command(BaseCommand):
    help = "Create or refresh test accounts and print how to sign in."

    def add_arguments(self, parser):
        parser.add_argument(
            "--domain",
            default=None,
            help="Use your own domain instead of naada.test, e.g. --domain gmail.com "
                 "with a +tag so real codes reach a real inbox.",
        )
        parser.add_argument(
            "--email",
            action="append",
            dest="emails",
            help=(
                "Seed an explicit email address. Pass this three times in "
                "artist, normal-user, venue-host order."
            ),
        )

    @transaction.atomic
    def handle(self, *args, **options):
        domain = options.get("domain")
        emails = options.get("emails")
        if emails:
            if len(emails) != 3:
                raise CommandError("Pass --email exactly three times.")
            if any("@" not in email for email in emails):
                raise CommandError("Each --email value must be a valid email address.")
            domains = [email.rsplit("@", 1)[-1].lower() for email in emails]
            if len(set(domains)) != 3:
                raise CommandError("The three --email values must use different domains.")

        rows = []

        accounts = (
            [ACCOUNTS[1], ACCOUNTS[0], ACCOUNTS[2]]
            if emails
            else ACCOUNTS
        )
        for index, (email, name, role, purpose) in enumerate(accounts):
            if emails:
                email = emails[index].lower()
            if domain:
                local = email.split("@")[0]
                email = f"{local}@{domain}"

            user, created = User.objects.get_or_create(
                email=email,
                defaults={"full_name": name, "is_verified": True},
            )
            changed = []
            if user.role != role:
                user.role = role
                changed.append("role")
            if not user.full_name:
                user.full_name = name
                changed.append("full_name")
            if not user.is_verified:
                user.is_verified = True
                changed.append("is_verified")
            # An admin needs the staff flag too, or the ops endpoints refuse it.
            if role == "admin" and not user.is_staff:
                user.is_staff = True
                changed.append("is_staff")
            if changed:
                user.save(update_fields=changed)

            # Selecting the artist role has to produce a bookable artist.
            if role == "artist":
                from apps.artists.models import Artist

                Artist.objects.get_or_create(
                    user=user,
                    defaults={"stage_name": name, "bio": "Test artist account."},
                )

            rows.append((email, role, purpose, "created" if created else "updated"))

        width = max(len(r[0]) for r in rows)
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("Test accounts ready — sign in with the email, no password."))
        self.stdout.write("")
        for email, role, purpose, state in rows:
            self.stdout.write(f"  {email:<{width}}  {role:<12} ({state})")
            self.stdout.write(f"  {'':<{width}}  {purpose}")
            self.stdout.write("")

        self.stdout.write(
            "How to sign in:\n"
            "  1. Open the site and choose Sign in.\n"
            "  2. Enter one of the addresses above.\n"
            "  3. In local development the 6-digit code is shown on screen and\n"
            "     also printed to the backend terminal. With SMTP configured it\n"
            "     is emailed instead — use --domain with an address you can read.\n"
        )
