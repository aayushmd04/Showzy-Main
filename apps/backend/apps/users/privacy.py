"""Privacy rights under the Digital Personal Data Protection Act, 2023.

Three things live here, kept apart from the HTTP layer so they can be tested
(and audited) as plain functions:

* `deletion_report` — what erasing an account would do, and what stops it.
* `erase_account`   — the erasure itself.
* `export_data`     — the access right: everything we hold on a person.

Erasure is *not* a hard delete. Ticket, order and payment rows must survive for
tax and dispute purposes, and other people's records (an organiser's door list,
an artist's booking history) point at them. So we remove or blank everything
that identifies the person and leave the financial skeleton behind.
"""

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

#: Event statuses that mean "people may still turn up".
LIVE_EVENT_STATUSES = ("published", "live", "postponed", "sold_out")

DELETED_NAME = "Deleted user"


# ── What would deleting do? ──────────────────────────────────────────────────

def _upcoming_events(user):
    from apps.events.models import Event

    return Event.objects.filter(
        organizer=user, is_deleted=False,
        status__in=LIVE_EVENT_STATUSES, end_datetime__gt=timezone.now(),
    )


def _open_bookings(user):
    """Artist/organiser bookings that still have money or a performance pending."""
    from apps.artists.models import Artist
    from apps.bookings.models import BookingOrder

    artists = Artist.objects.filter(user=user)
    return BookingOrder.objects.filter(
        Q(organizer__memberships__user=user, organizer__memberships__is_active=True)
        | Q(artist__in=artists)
    ).exclude(status__in=BookingOrder.TERMINAL).distinct()


def _upcoming_tickets(user):
    from apps.tickets.models import Ticket

    return Ticket.objects.filter(
        user=user, status=Ticket.Status.VALID, event__end_datetime__gt=timezone.now()
    ).select_related("event")


ERASED = [
    "Your name, email address, phone number, bio, photo and social links",
    "Your sign-in codes, devices and every active session",
    "Your saved events, notifications and email preferences",
    "Contact details printed on your tickets (name, email, phone)",
    "Your reviews and your messages in event chats",
    "Gate-team invitations and access",
    "IP addresses and browser details we logged against your orders and event views",
    "Draft events, and your artist profile or venue if you have one (with their PAN, GST and bank details)",
]

KEPT = [
    "Ticket numbers, orders and payment records — without your name or contact details — because tax law requires us to keep them",
    "Booking records with artists and organisers (amounts and dates), which the other party is entitled to keep",
    "A log of what you agreed to and when (no contact details), so we can show consent was asked for",
]


def deletion_report(user) -> dict:
    blockers, warnings = [], []

    events = list(_upcoming_events(user)[:5])
    if events:
        n = _upcoming_events(user).count()
        blockers.append({
            "code": "upcoming_events",
            "title": f"You have {n} upcoming event{'s' if n != 1 else ''}",
            "detail": "People may have bought tickets. Cancel them (so guests are refunded) or wait until they have ended, then delete your account.",
            "items": [e.title for e in events],
            "action_url": "/host/events",
        })

    bookings = list(_open_bookings(user)[:5])
    if bookings:
        n = _open_bookings(user).count()
        blockers.append({
            "code": "open_bookings",
            "title": f"You have {n} booking{'s' if n != 1 else ''} in progress",
            "detail": "Money is held in escrow until a gig is completed or cancelled. Finish or cancel these first so nobody is left unpaid.",
            "items": [str(b.id)[:8] for b in bookings],
            "action_url": "/host/bookings",
        })

    tickets = list(_upcoming_tickets(user)[:5])
    if tickets:
        n = _upcoming_tickets(user).count()
        warnings.append({
            "code": "upcoming_tickets",
            "title": f"You hold {n} ticket{'s' if n != 1 else ''} for upcoming events",
            "detail": "If you delete your account you lose access to them and they are not refunded. Cancel them first (before the cut-off) or transfer them to a friend if you want your money or your seat back.",
            "items": [t.event.title for t in tickets],
            "action_url": "/tickets",
        })

    return {
        "can_delete": not blockers,
        "blockers": blockers,
        "warnings": warnings,
        "erase": ERASED,
        "keep": KEPT,
    }


# ── The erasure itself ───────────────────────────────────────────────────────

@transaction.atomic
def erase_account(user) -> None:
    """Remove or blank everything that identifies `user`. Caller has already
    checked `deletion_report` and re-authenticated the person."""
    from rest_framework_simplejwt.token_blacklist.models import (
        BlacklistedToken, OutstandingToken,
    )

    from apps.artists.models import Artist
    from apps.bookings.models import Organizer
    from apps.chat.models import ChatRoomMembership, Message
    from apps.events.models import Event, EventReview, EventSave, EventView
    from apps.notifications.models import Notification, NotificationPreference
    from apps.tickets.models import GateAssignment, Order, Ticket
    from apps.venues.models import Venue

    from .models import OTPToken, UserDevice

    now = timezone.now()
    old_email = (user.email or "").lower()
    old_phone = user.phone

    # Sign-in material tied to the address.
    OTPToken.objects.filter(email__iexact=old_email).delete()

    # Gate duty: assignments, and invitations that name this email/phone.
    gate = Q(user=user) | Q(invitee_email__iexact=old_email)
    if old_phone:
        gate |= Q(invitee_phone=old_phone)
    GateAssignment.objects.filter(gate).delete()

    # Preferences, inbox, bookmarks, public content.
    Notification.objects.filter(user=user).delete()
    NotificationPreference.objects.filter(user=user).delete()
    EventSave.objects.filter(user=user).delete()
    EventReview.objects.filter(reviewer=user).delete()
    EventView.objects.filter(user=user).delete()
    ChatRoomMembership.objects.filter(user=user).delete()
    Message.objects.filter(sender=user).update(content="", is_deleted=True, deleted_at=now)
    UserDevice.objects.filter(user=user).delete()

    # Rows we must keep (tax) lose their personal details.
    Ticket.objects.filter(user=user).update(holder_name=DELETED_NAME, holder_email="", holder_phone="")
    Order.objects.filter(user=user).update(ip_address=None, user_agent="")

    # Things they owned: draft events go; artist and venue profiles are retired
    # and their compliance details (PAN, GST, bank) are blanked.
    Event.objects.filter(organizer=user, is_deleted=False).exclude(
        status__in=LIVE_EVENT_STATUSES
    ).update(is_deleted=True, deleted_at=now)
    payout_blank = dict(
        gst_number="", pan_number="", bank_account_holder_name="",
        bank_account_number="", bank_ifsc_code="", bank_name="",
    )
    for artist in Artist.objects.filter(user=user):
        for k, v in payout_blank.items():
            setattr(artist, k, v)
        artist.bio = artist.bio_kn = artist.instagram = ""
        artist.is_active = False
        artist.save()
        artist.soft_delete()
    for venue in Venue.objects.filter(owner=user):
        for k, v in payout_blank.items():
            setattr(venue, k, v)
        venue.is_active = False
        venue.save()
        venue.soft_delete()
    for org in Organizer.objects.filter(memberships__user=user).distinct():
        org.memberships.filter(user=user).update(is_active=False)

    # Finally the account row itself.
    stamp = now.strftime("%Y%m%d%H%M%S")
    user.email = f"deleted+{user.pk}.{stamp}@naada.invalid"
    user.phone = None
    user.full_name = DELETED_NAME
    user.display_name = ""
    user.bio = ""
    user.website = ""
    user.instagram = ""
    user.avatar = None
    user.city = None
    user.last_login_ip = None
    user.last_login_device = ""
    user.is_active = False
    user.save(update_fields=[
        "email", "phone", "full_name", "display_name", "bio", "website",
        "instagram", "avatar", "city", "last_login_ip", "last_login_device",
        "is_active",
    ])
    user.soft_delete()

    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


# ── The access right ─────────────────────────────────────────────────────────

def export_data(user) -> dict:
    """Everything we hold on `user`, assembled by hand so that adding a model
    never silently starts leaking a new field."""
    from .serializers import UserProfileSerializer

    data = {
        "exported_at": timezone.now().isoformat(),
        "about_this_file": (
            "A copy of the personal data Showzy holds about you. "
            "Questions or corrections: see the Contact page. Payment card details are "
            "never held by Showzy."
        ),
        "account": UserProfileSerializer(user).data,
    }

    def section(name, build):
        try:
            data[name] = build()
        except Exception:  # pragma: no cover - an export must never 500
            import logging
            logging.getLogger(__name__).exception("Export section %s failed for %s", name, user.pk)
            data[name] = []

    def tickets():
        from apps.tickets.models import Ticket
        return [{
            "ticket_number": t.ticket_number, "event": t.event.title,
            "tier": t.tier.name if t.tier else None, "seat": t.seat_label,
            "status": t.status,
            "holder_name": t.holder_name, "holder_email": t.holder_email, "holder_phone": t.holder_phone,
            "checked_in_at": t.checked_in_at.isoformat() if t.checked_in_at else None,
            "purchased_at": t.created_at.isoformat(),
        } for t in Ticket.objects.filter(user=user).select_related("event", "tier")]

    def orders():
        from apps.tickets.models import Order
        return [{
            "id": str(o.id), "event": o.event.title, "status": o.status,
            "total_amount": str(o.total_amount), "created_at": o.created_at.isoformat(),
        } for o in Order.objects.filter(user=user).select_related("event")]

    def saved():
        from apps.events.models import EventSave
        return [{"event": s.event.title, "saved_at": s.created_at.isoformat()}
                for s in EventSave.objects.filter(user=user).select_related("event")]

    def reviews():
        from apps.events.models import EventReview
        return [{"event": r.event.title, "rating": r.rating, "comment": r.comment,
                 "created_at": r.created_at.isoformat()}
                for r in EventReview.objects.filter(reviewer=user).select_related("event")]

    def notifications():
        from apps.notifications.models import Notification
        return [{"title": n.title, "body": n.body, "created_at": n.created_at.isoformat()}
                for n in Notification.objects.filter(user=user)]

    def gate_duty():
        from apps.tickets.models import GateAssignment
        return [{"event": a.event.title, "status": a.status, "post": a.label,
                 "responded_at": a.responded_at.isoformat() if a.responded_at else None}
                for a in GateAssignment.objects.filter(user=user).select_related("event")]

    def artist_profile():
        from apps.artists.models import Artist
        return [{"stage_name": a.stage_name, "bio": a.bio, "instagram": a.instagram,
                 "has_bank_details": a.has_bank_details, "kyc_status": a.kyc_status}
                for a in Artist.objects.filter(user=user)]

    def venues():
        from apps.venues.models import Venue
        return [{"name": v.name, "address": v.address_line1, "kyc_status": v.kyc_status,
                 "has_bank_details": v.has_bank_details}
                for v in Venue.objects.filter(owner=user)]

    def devices():
        return [{"platform": d.platform, "registered_at": d.created_at.isoformat()}
                for d in user.devices.all()]

    def preferences():
        from apps.notifications.models import NotificationPreference
        p = NotificationPreference.objects.filter(user=user).first()
        if not p:
            return {}
        return {f.name: getattr(p, f.name) for f in p._meta.fields
                if f.name not in ("id", "user", "created_at", "updated_at")}

    def consents():
        return [{"kind": c.kind, "version": c.version, "granted": c.granted,
                 "source": c.source, "at": c.created_at.isoformat()}
                for c in user.consents.all()]

    for name, build in (
        ("tickets", tickets), ("ticket_orders", orders), ("saved_events", saved),
        ("reviews", reviews), ("notifications", notifications), ("gate_duty", gate_duty),
        ("artist_profile", artist_profile), ("venues", venues), ("devices", devices),
        ("email_preferences", preferences), ("consents", consents),
    ):
        section(name, build)
    return data
