"""The QR code is the credential at the door, so it must only ever reach its holder.

It used to be written to ``media/tickets/qr/<yyyy>/<mm>/ticket_<number>.png`` with a
sequential number (``ABC-00001``), under a media route that needs no sign-in: anyone could
walk the numbers and download every buyer's entry QR.
"""

import base64
import importlib
import re
import uuid

from django.apps import apps as django_apps
from django.urls import reverse

from apps.tickets.models import Ticket
from apps.tickets.test_gate import GateBase
from apps.tickets.views import generate_ticket_number

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def png_from(data_uri):
    prefix = "data:image/png;base64,"
    assert data_uri.startswith(prefix), data_uri[:40]
    return base64.b64decode(data_uri[len(prefix):])


class QrReachesOnlyTheHolderTests(GateBase):
    def test_the_holder_gets_a_real_png_inline_and_nothing_is_stored(self):
        res = self.as_user(self.buyer).get(reverse("tickets-detail", args=[self.ticket.id]))
        self.assertEqual(res.status_code, 200)
        self.assertTrue(png_from(res.data["qr_image_url"]).startswith(PNG_MAGIC))
        self.ticket.refresh_from_db()
        self.assertFalse(self.ticket.qr_image)  # no file on disk, no URL to guess

    def test_the_my_tickets_list_carries_it_too(self):
        res = self.as_user(self.buyer).get(reverse("tickets-mine"))
        self.assertTrue(all(png_from(t["qr_image_url"]).startswith(PNG_MAGIC) for t in res.data["results"]))

    def test_a_different_ticket_has_a_different_qr(self):
        a = self.ticket.qr_png_bytes()
        b = self.other_ticket.qr_png_bytes()
        self.assertNotEqual(a, b)

    def test_door_staff_scanning_someone_elses_ticket_do_not_receive_the_qr(self):
        res = self.scan(self.host, self.ticket)
        self.assertEqual(res.status_code, 200, res.data)
        self.assertIsNone(res.data["ticket"].get("qr_image_url"))

    def test_nobody_else_can_open_the_ticket(self):
        res = self.as_user(self.stranger).get(reverse("tickets-detail", args=[self.ticket.id]))
        self.assertEqual(res.status_code, 404)

    def test_the_old_media_path_is_never_served(self):
        for path in ("/media/tickets/qr/2026/10/ticket_ABC-00001.png", "/media/tickets/qr/x.png"):
            self.assertEqual(self.client.get(path).status_code, 404, path)


class TicketNumberTests(GateBase):
    def test_numbers_are_not_sequential_or_guessable(self):
        numbers = {generate_ticket_number(self.event) for _ in range(50)}
        self.assertEqual(len(numbers), 50)
        for n in numbers:
            self.assertRegex(n, r"^[A-Z0-9]{1,3}-[2-9A-HJKMNP-Z]{6}$")
            self.assertLessEqual(len(n), 20)  # the column's max_length

    def test_never_reuses_an_existing_number(self):
        taken = self.ticket.ticket_number
        self.assertNotEqual(generate_ticket_number(self.event), taken)


class MigrationRotatesExposedQrCodesTests(GateBase):
    """Everything that was ever published is treated as compromised."""

    def test_exposed_tickets_get_a_new_qr_and_lose_the_file_name(self):
        migration = importlib.import_module("apps.tickets.migrations.0008_retire_public_qr_images")
        exposed = self.ticket
        exposed.qr_image.name = "tickets/qr/2026/10/ticket_ABC-00001.png"
        exposed.save(update_fields=["qr_image"])
        old_qr = exposed.qr_data
        untouched_qr = self.other_ticket.qr_data  # never had an image: nothing leaked

        migration.retire_public_qr_images(django_apps, None)

        exposed.refresh_from_db()
        self.other_ticket.refresh_from_db()
        self.assertNotEqual(exposed.qr_data, old_qr)
        self.assertFalse(exposed.qr_image)
        self.assertEqual(self.other_ticket.qr_data, untouched_qr)

    def test_the_old_code_no_longer_scans(self):
        migration = importlib.import_module("apps.tickets.migrations.0008_retire_public_qr_images")
        self.ticket.qr_image.name = "tickets/qr/2026/10/ticket_ABC-00001.png"
        self.ticket.save(update_fields=["qr_image"])
        leaked = self.ticket.qr_data
        migration.retire_public_qr_images(django_apps, None)
        res = self.as_user(self.host).post(reverse("tickets-scan", args=[leaked]))
        self.assertEqual(res.status_code, 404)
        self.assertIsInstance(leaked, uuid.UUID)
