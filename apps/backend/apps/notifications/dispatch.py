"""Sending notifications — email now, push when a provider is configured.

Every call here is best-effort and must never break the transaction that
triggered it. A buyer whose payment succeeded but whose receipt failed to send
still owns their ticket; raising would roll that back.

Nothing previously created a Notification except two Celery tasks that had
never run, so the table was permanently empty and no one was ever told
anything.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils import timezone

from .models import Channel, Notification, NotificationPreference, NotificationType

logger = logging.getLogger(__name__)


def _prefs(user):
    prefs, _ = NotificationPreference.objects.get_or_create(user=user)
    return prefs


def record(user, *, notification_type, title, body, action_url="", data=None):
    """Write the in-app notification row. Returns it, or None on failure."""
    try:
        return Notification.objects.create(
            user=user,
            notification_type=notification_type,
            channel=Channel.IN_APP,
            title=title,
            body=body,
            action_url=action_url or "",
            data=data or {},
            is_sent=True,
            sent_at=timezone.now(),
        )
    except Exception:
        logger.exception("Could not record notification for user %s", getattr(user, "pk", None))
        return None


def send_email(user, subject, text_body, html_body=None, *, notification_type=None):
    """Send one email. Swallows every failure — callers are mid-transaction."""
    if not getattr(user, "email", None):
        return False
    try:
        message = EmailMultiAlternatives(
            subject=subject,
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.email],
        )
        if html_body:
            message.attach_alternative(html_body, "text/html")
        message.send(fail_silently=False)
        return True
    except Exception:
        logger.exception(
            "Email send failed (%s) to user %s", notification_type, getattr(user, "pk", None)
        )
        return False


def order_confirmed(order):
    """Receipt plus ticket details, the moment an order is confirmed.

    Buyers previously got nothing at all after paying. For a gig days away, the
    email with the code on it is the product.
    """
    user = order.user
    tickets = list(order.tickets.all().select_related("tier"))
    event = order.event
    when = timezone.localtime(event.start_datetime).strftime("%a %d %b %Y, %I:%M %p")
    venue = getattr(event.venue, "name", "") or ""

    lines = [f"  {t.ticket_number}  ·  {t.tier.name if t.tier else 'General'}" for t in tickets]
    ticket_block = "\n".join(lines) if lines else "  (see My Tickets)"
    count = len(tickets) or 1
    noun = "ticket" if count == 1 else "tickets"

    title = f"You're going to {event.title}"
    body = (
        f"{count} {noun} confirmed for {event.title} — {when}"
        f"{f' at {venue}' if venue else ''}."
    )

    record(
        user,
        notification_type=NotificationType.TICKET_CONFIRMED,
        title=title,
        body=body,
        action_url="/tickets",
        data={"order_id": str(order.id), "event_id": str(event.id)},
    )

    if not _prefs(user).ticket_confirmed_email:
        return

    text = f"""Hi {user.name or ''},

You're going to {event.title}.

  When:   {when}
  Where:  {venue}
  Paid:   Rs {order.total_amount}

Your {noun}:
{ticket_block}

Show the QR code from My Tickets at the door — screenshots work, and so does
the email. There's no need to print anything.

See your tickets: {settings.FRONTEND_URL}/tickets

Enjoy the show.
— Naada
"""
    send_email(
        user,
        f"Your {noun} for {event.title}",
        text,
        notification_type="ticket_confirmed",
    )


def order_refunded(order, amount):
    user = order.user
    title = "Refund on its way"
    body = (
        f"Rs {amount} for {order.event.title} is being returned to your original "
        f"payment method. Banks usually take 5-7 working days."
    )
    record(
        user,
        notification_type=NotificationType.REFUND_INITIATED,
        title=title,
        body=body,
        action_url="/tickets",
        data={"order_id": str(order.id)},
    )
    send_email(
        user,
        f"Refund for {order.event.title}",
        f"""Hi {user.name or ''},

{body}

We'll email again if anything changes.

— Naada
""",
        notification_type="refund_processed",
    )
