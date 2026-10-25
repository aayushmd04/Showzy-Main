import uuid

from django.db import migrations, models


def retire_public_qr_images(apps, schema_editor):
    """Neutralise every QR image that was ever published.

    Until now each ticket's QR was saved as ``tickets/qr/<yyyy>/<mm>/ticket_<number>.png``
    and served without authentication, under a sequential, guessable name. Anyone
    could have downloaded them, so deleting the files is not enough: the QR value
    itself (``qr_data``) is the credential, and it has to change. Every ticket that
    had an image gets a fresh ``qr_data``; the holder's app shows the new code the
    next time it loads the ticket. Then the files are deleted.
    """
    Ticket = apps.get_model("tickets", "Ticket")

    exposed = Ticket.objects.exclude(qr_image="").exclude(qr_image__isnull=True)
    for ticket in exposed.iterator():
        old_name = ticket.qr_image.name
        ticket.qr_data = uuid.uuid4()
        ticket.qr_image = None
        ticket.save(update_fields=["qr_data", "qr_image"])
        try:
            ticket._meta.get_field("qr_image").storage.delete(old_name)
        except Exception:  # a file already gone, or storage unreachable, must not block deploy
            pass


class Migration(migrations.Migration):

    dependencies = [
        ("tickets", "0007_gateassignment"),
    ]

    operations = [
        migrations.AlterField(
            model_name="ticket",
            name="qr_image",
            field=models.ImageField(blank=True, editable=False, null=True, upload_to="tickets/qr/%Y/%m/"),
        ),
        migrations.RunPython(retire_public_qr_images, migrations.RunPython.noop),
    ]
