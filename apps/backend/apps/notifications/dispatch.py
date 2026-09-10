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


def _day(value):
    """'Fri 14 Mar' — the way anyone would actually say a date out loud."""
    return value.strftime("%a %d %b").replace(" 0", " ")


def _when(dt):
    return timezone.localtime(dt).strftime("%a %d %b, %I:%M %p").replace(" 0", " ")


def _rupees(amount):
    """Whole rupees. Nobody negotiates a gig fee in paise."""
    try:
        return f"{int(round(float(amount))):,}"
    except (TypeError, ValueError):
        return str(amount)


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


# ─── Bookings ────────────────────────────────────────────────────────────────
#
# Everything below follows the same shape as the two above: write the in-app
# row unconditionally, then email only if the recipient still wants email.


def _organizer_users(organizer):
    """Everyone who can act for this organiser.

    Staff are included deliberately. On a two-person venue the owner is often
    not the one reading the inbox, and an offer reply only the owner sees is an
    offer reply nobody sees.
    """
    return [
        m.user
        for m in organizer.memberships.filter(is_active=True).select_related("user")
        if m.user_id
    ]


def _artist_user(artist):
    user = getattr(artist, "user", None)
    return [user] if user else []


def _counterparty(conversation, actor):
    """(recipients, side) — whoever is on the other end of this thread.

    `side` is the recipient's side, which decides where the notification
    should land them: an artist goes to their offers, a host to their bookings.
    """
    artist_user_id = getattr(conversation.artist, "user_id", None)
    if artist_user_id and actor and actor.pk == artist_user_id:
        return _organizer_users(conversation.organizer), "host"
    return _artist_user(conversation.artist), "artist"


def _offer_home(side):
    return "/artist/offers" if side == "artist" else "/host/bookings"


def _actor_label(conversation, side):
    """Name the *sender* the way the recipient thinks of them."""
    if side == "artist":
        return conversation.organizer.name
    return conversation.artist.stage_name


def _offer_terms(offer):
    sets = offer.set_count
    set_text = f"{sets} set" if sets == 1 else f"{sets} sets"
    return (
        f"Rs {_rupees(offer.fee_amount)} for {_day(offer.performance_date)} — "
        f"{set_text}, {offer.performance_duration_minutes} minutes."
    )


def offer_made(offer, actor):
    """A new offer (or counter-offer) landed. Tell the other party."""
    convo = offer.conversation
    recipients, side = _counterparty(convo, actor)
    sender = _actor_label(convo, side)
    is_counter = offer.counter_of_id is not None

    title = (
        f"{sender} countered on {_day(offer.performance_date)}"
        if is_counter
        else f"{sender} wants to book you for {_day(offer.performance_date)}"
    )
    if side == "host":
        title = (
            f"{sender} countered your offer"
            if is_counter
            else f"{sender} sent you an offer for {_day(offer.performance_date)}"
        )

    body = _offer_terms(offer) + " Offers expire after 48 hours."
    action_url = _offer_home(side)
    note_block = f"They added: {offer.notes.strip()}\n\n" if offer.notes.strip() else ""

    for user in recipients:
        record(
            user,
            notification_type=NotificationType.BOOKING_OFFER,
            title=title,
            body=body,
            action_url=action_url,
            data={"offer_id": str(offer.id), "conversation_id": str(convo.id)},
        )
        if not _prefs(user).booking_activity_email:
            continue
        send_email(
            user,
            title,
            f"""Hi {user.name or ''},

{body}

{note_block}Reply, counter or accept here: {settings.FRONTEND_URL}{action_url}

— Naada
""",
            notification_type="booking_offer",
        )


def offer_answered(offer, actor):
    """An offer was accepted, declined or withdrawn. Tell whoever is waiting.

    Accept and decline go back to the person who made the offer. A withdrawal
    goes the other way — to the party who was still sitting on it.
    """
    convo = offer.conversation
    withdrawn = offer.status == "withdrawn"

    if withdrawn:
        recipients, side = _counterparty(convo, actor)
    else:
        proposer = offer.proposed_by
        artist_user_id = getattr(convo.artist, "user_id", None)
        side = "artist" if (proposer and proposer.pk == artist_user_id) else "host"
        recipients = [proposer] if proposer else []

    other = _actor_label(convo, side)
    day = _day(offer.performance_date)
    fee = f"Rs {_rupees(offer.fee_amount)}"
    action_url = _offer_home(side)

    if offer.status == "accepted":
        kind = NotificationType.BOOKING_OFFER_ACCEPTED
        title = f"{other} accepted your offer for {day}"
        body = (
            f"{fee} on {day} is agreed. "
            + (
                "Fund the booking to lock the date — the money sits in escrow until "
                "the night is done."
                if side == "host"
                else "The host funds it next; you'll see it move to confirmed here."
            )
        )
    elif withdrawn:
        kind = NotificationType.BOOKING_OFFER_WITHDRAWN
        title = f"{other} withdrew the offer for {day}"
        body = (
            f"The {fee} offer for {day} is off the table. The conversation is still "
            f"open if you want to propose different terms."
        )
    else:
        kind = NotificationType.BOOKING_OFFER_DECLINED
        title = f"{other} passed on {day}"
        body = (
            f"They didn't take {fee} for {day}. You can send a fresh offer with "
            f"different terms — most bookings take two or three rounds."
        )

    for user in recipients:
        record(
            user,
            notification_type=kind,
            title=title,
            body=body,
            action_url=action_url,
            data={"offer_id": str(offer.id), "conversation_id": str(convo.id)},
        )
        if not _prefs(user).booking_activity_email:
            continue
        send_email(
            user,
            title,
            f"""Hi {user.name or ''},

{body}

See the thread: {settings.FRONTEND_URL}{action_url}

— Naada
""",
            notification_type="booking_offer_response",
        )


def gig_application_reviewed(application):
    """A host made a call on an artist's gig-board application."""
    recipients = _artist_user(application.artist)
    if not recipients:
        return

    event = application.event
    host = event.organizer.name if event.organizer else "The host"
    when = _when(event.start_datetime)
    venue = getattr(event.venue, "name", "") or ""
    status = application.status

    if status == "accepted":
        title = f"You're on the bill for {event.title}"
        body = (
            f"{host} accepted your application. {when}"
            f"{f' at {venue}' if venue else ''}. They'll be in touch with the "
            f"running order."
        )
    elif status == "shortlisted":
        title = f"You've been shortlisted for {event.title}"
        body = (
            f"{host} is considering you for {when}. Nothing to do yet — they'll "
            f"come back with a yes or an offer."
        )
    elif status == "rejected":
        title = f"{event.title} went to someone else"
        body = (
            f"{host} passed on your application this time. Your profile stays on "
            f"the gig board, and new dates go up every week."
        )
    else:
        return

    action_url = "/artist/gig-board"
    for user in recipients:
        record(
            user,
            notification_type=NotificationType.GIG_APPLICATION_REVIEWED,
            title=title,
            body=body,
            action_url=action_url,
            data={"application_id": str(application.id), "event_id": str(event.id),
                  "status": status},
        )
        if not _prefs(user).booking_activity_email:
            continue
        send_email(
            user,
            title,
            f"""Hi {user.name or ''},

{body}

{settings.FRONTEND_URL}{action_url}

— Naada
""",
            notification_type="gig_application_reviewed",
        )


# ─── Events people hold tickets for ──────────────────────────────────────────


def _ticket_holders(event):
    """Distinct users holding a live ticket to this event."""
    from apps.tickets.models import Ticket

    user_ids = (
        Ticket.objects.filter(
            event=event, status__in=[Ticket.Status.VALID, Ticket.Status.USED]
        )
        .values_list("user_id", flat=True)
        .distinct()
    )
    if not user_ids:
        return []
    from django.contrib.auth import get_user_model

    return list(get_user_model().objects.filter(id__in=list(user_ids)))


def event_cancelled(event):
    """The gig is off. Everyone holding a ticket needs to know today."""
    when = _when(event.start_datetime)
    title = f"{event.title} is cancelled"
    body = (
        f"The organiser has called off {event.title} on {when}. Don't head to the "
        f"venue. Any refund due is handled through the original payment method — "
        f"My Tickets shows the latest."
    )

    for user in _ticket_holders(event):
        record(
            user,
            notification_type=NotificationType.EVENT_CANCELLED,
            title=title,
            body=body,
            action_url="/tickets",
            data={"event_id": str(event.id)},
        )
        if not _prefs(user).event_change_email:
            continue
        send_email(
            user,
            title,
            f"""Hi {user.name or ''},

{body}

Your tickets: {settings.FRONTEND_URL}/tickets

Sorry about this one.
— Naada
""",
            notification_type="event_cancelled",
        )


def event_changed(event, *, time_changed=False, venue_changed=False):
    """The date, the time or the room moved. Ticket holders need the new one."""
    if not (time_changed or venue_changed):
        return

    when = _when(event.start_datetime)
    venue = getattr(event.venue, "name", "") or ""

    if time_changed and venue_changed:
        title = f"{event.title} has moved"
        detail = f"New time and new room: {when}{f' at {venue}' if venue else ''}."
    elif time_changed:
        title = f"{event.title} has a new time"
        detail = f"It now starts {when}{f' at {venue}' if venue else ''}."
    else:
        title = f"{event.title} has a new venue"
        detail = f"It's now at {venue}, still {when}."

    body = f"{detail} Your ticket still works — nothing to re-book."

    for user in _ticket_holders(event):
        record(
            user,
            notification_type=NotificationType.EVENT_UPDATED,
            title=title,
            body=body,
            action_url="/tickets",
            data={"event_id": str(event.id)},
        )
        if not _prefs(user).event_change_email:
            continue
        send_email(
            user,
            title,
            f"""Hi {user.name or ''},

{body}

Your tickets: {settings.FRONTEND_URL}/tickets

— Naada
""",
            notification_type="event_updated",
        )
