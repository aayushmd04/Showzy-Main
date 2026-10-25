"""Gatekeepers — invited, event-scoped ticket checkers.

Access model (kept small on purpose):

* A gatekeeper is an ordinary account. Being one is a ``GateAssignment`` row
  tying that account to ONE event; it changes nothing about their role.
* While the assignment is ``active`` and the clock is inside the event's gate
  window, they may (1) scan tickets for that event and (2) read that event's
  door list. Nothing else — no orders, revenue, buyer contact details, venue or
  other events. Those endpoints all check organiser/staff status, which a
  gatekeeper does not have.
* The host (organiser) manages the team and sees every scan, live.
"""

from datetime import timedelta

from django.db import models, transaction
from django.utils import timezone
from rest_framework import exceptions, permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from apps.events.models import Event
from apps.notifications.dispatch import record
from apps.notifications.models import NotificationType

from .models import GateAssignment, Ticket

#: Gate access opens this long before the event starts and closes this long
#: after it ends — enough for setup and a late finish, but not "any other day".
WINDOW_BEFORE = timedelta(hours=4)
WINDOW_AFTER = timedelta(hours=4)
MAX_TEAM = 25


def gate_window(event):
    return event.start_datetime - WINDOW_BEFORE, event.end_datetime + WINDOW_AFTER


def is_organiser(user, event) -> bool:
    if not user or not user.is_authenticated:
        return False
    return bool(user.is_staff or getattr(user, "role", "") == "admin"
                or event.organizer_id == user.id)


def active_assignment(user, event):
    if not user or not user.is_authenticated:
        return None
    return GateAssignment.objects.filter(
        event=event, user=user, status=GateAssignment.Status.ACTIVE
    ).first()


def gate_open_now(event, now=None) -> bool:
    now = now or timezone.now()
    opens, closes = gate_window(event)
    return opens <= now <= closes


def gatekeeper_may_scan(user, event) -> bool:
    """Active assignment, event not cancelled, and inside the gate window."""
    if not active_assignment(user, event):
        return False
    if getattr(event, "status", "") == "cancelled":
        return False
    return gate_open_now(event)


def gate_denial_reason(user, event) -> str:
    """Why a signed-in non-organiser can't work this door, in plain words."""
    if active_assignment(user, event):
        if not gate_open_now(event):
            opens, closes = gate_window(event)
            when = timezone.localtime(opens if timezone.now() < opens else closes)
            verb = "opens" if timezone.now() < opens else "closed"
            return f"Your gate access for this event {verb} {when.strftime('%a %d %b, %I:%M %p')}."
        return "This event is cancelled."
    return "Only this event's organiser or an invited gatekeeper can check tickets in."


def _contact(email, phone):
    return (email or "").strip().lower(), "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+")


def invitations_q(user):
    """Pending invites that name this account's own email or phone."""
    q = models.Q()
    has = False
    if user.email:
        q |= models.Q(invitee_email__iexact=user.email)
        has = True
    if getattr(user, "phone", None):
        q |= models.Q(invitee_phone=user.phone)
        has = True
    if not has:
        return GateAssignment.objects.none()
    return GateAssignment.objects.filter(q, status=GateAssignment.Status.PENDING)


def _event_card(event):
    venue = getattr(event, "venue", None)
    return {
        "id": str(event.id),
        "title": event.title,
        "venue": venue.name if venue else "",
        "starts_at": event.start_datetime,
        "ends_at": event.end_datetime,
    }


def _display(user):
    return (getattr(user, "full_name", "") or getattr(user, "display_name", "")
            or user.email or "Someone")


def _event_or_403(request, event_id):
    event = Event.objects.select_related("venue").filter(pk=event_id, is_deleted=False).first()
    if event is None:
        raise exceptions.NotFound("Event not found.")
    if not is_organiser(request.user, event):
        raise exceptions.PermissionDenied("Only this event's organiser can manage its gate team.")
    return event


# ── Host side ────────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def gate_overview(request, event_id):
    """The live picture of a door: who's on the team and every scan so far."""
    event = _event_or_403(request, event_id)
    assignments = list(event.gate_assignments.select_related("user").exclude(
        status=GateAssignment.Status.DECLINED))

    scans = Ticket.objects.filter(event=event, checked_in_at__isnull=False)
    per_user = {
        row["checked_in_by"]: row
        for row in scans.values("checked_in_by").annotate(
            n=models.Count("id"), last=models.Max("checked_in_at"))
    }

    team = []
    for a in assignments:
        stats = per_user.get(a.user_id) if a.user_id else None
        team.append({
            "id": str(a.id),
            "status": a.status,
            "invitee": a.invitee_email or a.invitee_phone,
            "label": a.label,
            "name": _display(a.user) if a.user else "",
            "email": a.user.email if a.user else "",
            "invited_at": a.created_at,
            "responded_at": a.responded_at,
            "scan_count": stats["n"] if stats else 0,
            "last_scan_at": stats["last"] if stats else None,
        })

    recent = scans.select_related("checked_in_by", "tier").order_by("-checked_in_at")[:40]
    total = Ticket.objects.filter(event=event).exclude(status=Ticket.Status.CANCELLED).count()
    opens, closes = gate_window(event)
    organiser_scans = per_user.get(event.organizer_id)
    return Response({
        "event": _event_card(event),
        "window": {"opens": opens, "closes": closes, "open_now": gate_open_now(event)},
        "totals": {
            "admitted": scans.count(),
            "tickets": total,
            "by_organiser": organiser_scans["n"] if organiser_scans else 0,
        },
        "team": team,
        "recent": [{
            "ticket_number": t.ticket_number,
            "holder_name": t.holder_name,
            "tier": t.tier.name if t.tier else "",
            "seat": t.seat_label,
            "at": t.checked_in_at,
            "by_id": str(t.checked_in_by_id) if t.checked_in_by_id else None,
            "by_name": ("You" if t.checked_in_by_id == request.user.id
                        else _display(t.checked_in_by)) if t.checked_in_by else "Unknown",
        } for t in recent],
        "max_team": MAX_TEAM,
    })


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def gate_invite(request, event_id):
    event = _event_or_403(request, event_id)
    email, phone = _contact(request.data.get("email"), request.data.get("phone"))
    label = str(request.data.get("label") or "").strip()[:60]
    if bool(email) == bool(phone):
        return Response({"detail": "Give either an email or a phone number."},
                        status=status.HTTP_400_BAD_REQUEST)
    if email and ("@" not in email or "." not in email.split("@")[-1]):
        return Response({"detail": "That email doesn't look right."},
                        status=status.HTTP_400_BAD_REQUEST)
    if phone and not (8 <= len(phone.lstrip("+")) <= 14):
        return Response({"detail": "That phone number doesn't look right."},
                        status=status.HTTP_400_BAD_REQUEST)

    me = request.user
    if (email and email == (me.email or "").lower()) or (phone and phone == (me.phone or "")):
        return Response({"detail": "You already run this door as the organiser."},
                        status=status.HTTP_400_BAD_REQUEST)

    live = event.gate_assignments.filter(
        status__in=[GateAssignment.Status.PENDING, GateAssignment.Status.ACTIVE])
    if live.count() >= MAX_TEAM:
        return Response({"detail": f"A gate team is limited to {MAX_TEAM} people."},
                        status=status.HTTP_400_BAD_REQUEST)
    dup = live.filter(models.Q(invitee_email=email) if email else models.Q(invitee_phone=phone))
    if dup.exists():
        return Response({"detail": "That person is already invited to this event."},
                        status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        a = GateAssignment.objects.create(
            event=event, invited_by=me, invitee_email=email, invitee_phone=phone, label=label)

    # If they already have an account, tell them in-app. If not, the invite waits
    # for the day they sign up with that email/phone.
    from django.contrib.auth import get_user_model
    User = get_user_model()
    target = (User.objects.filter(email__iexact=email).first() if email
              else User.objects.filter(phone=phone).first())
    if target and target.pk != me.pk:
        record(
            target,
            notification_type=NotificationType.GATE_INVITE,
            title="You've been invited to check tickets",
            body=f"{_display(me)} invited you to be a gatekeeper for {event.title}.",
            action_url="/gate",
            data={"assignment": str(a.id), "event": str(event.id)},
        )
    return Response({"id": str(a.id), "status": a.status, "has_account": bool(target)},
                    status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([permissions.IsAuthenticated])
def gate_revoke(request, event_id, assignment_id):
    """Cancel an invite or end an active gatekeeper's access, effective at once."""
    event = _event_or_403(request, event_id)
    a = event.gate_assignments.filter(pk=assignment_id).first()
    if a is None:
        raise exceptions.NotFound("Not found.")
    if a.status in (GateAssignment.Status.PENDING, GateAssignment.Status.ACTIVE):
        a.status = GateAssignment.Status.REVOKED
        a.revoked_at = timezone.now()
        # The email/phone the host typed has done its job; don't keep a stranger's
        # contact details around once the invitation is withdrawn.
        a.invitee_email = ""
        a.invitee_phone = ""
        a.save(update_fields=["status", "revoked_at", "invitee_email", "invitee_phone", "updated_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)


# ── Gatekeeper side ──────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def gate_mine(request):
    """Invitations waiting for me, and the doors I currently work."""
    invites = invitations_q(request.user).select_related(
        "event", "event__venue", "invited_by").order_by("-created_at")
    now = timezone.now()
    # Once an event's gate window has closed there is nothing left to do at that
    # door. Dropping it here is also what makes "Gate duty" disappear from the
    # app for someone whose only shifts are over — the app shows that link only
    # to people this endpoint returns something for.
    active = GateAssignment.objects.filter(
        user=request.user, status=GateAssignment.Status.ACTIVE,
        event__is_deleted=False,
        event__end_datetime__gt=now - WINDOW_AFTER,
    ).select_related("event", "event__venue").order_by("event__start_datetime")

    return Response({
        "invitations": [{
            "id": str(i.id),
            "event": _event_card(i.event),
            "invited_by": _display(i.invited_by) if i.invited_by else "",
            "label": i.label,
            "invited_at": i.created_at,
        } for i in invites if i.event.end_datetime + WINDOW_AFTER > now],
        "assignments": [{
            "id": str(a.id),
            "event": _event_card(a.event),
            "label": a.label,
            "open_now": gatekeeper_may_scan(request.user, a.event),
            "opens": gate_window(a.event)[0],
            "closes": gate_window(a.event)[1],
            "scanned": Ticket.objects.filter(
                event=a.event, checked_in_by=request.user).count(),
        } for a in active],
    })


def _respond(request, assignment_id, accept):
    a = invitations_q(request.user).filter(pk=assignment_id).first()
    if a is None and not accept:
        # Leaving an assignment I already accepted.
        a = GateAssignment.objects.filter(
            pk=assignment_id, user=request.user, status=GateAssignment.Status.ACTIVE).first()
    if a is None:
        raise exceptions.NotFound("Invitation not found.")
    if accept:
        if a.event.end_datetime + WINDOW_AFTER < timezone.now():
            return Response({"detail": "That event is over."}, status=status.HTTP_400_BAD_REQUEST)
        a.status = GateAssignment.Status.ACTIVE
        a.user = request.user
    else:
        a.status = GateAssignment.Status.DECLINED
        a.user = request.user
        a.invitee_email = ""
        a.invitee_phone = ""
    a.responded_at = timezone.now()
    a.save(update_fields=["status", "user", "responded_at", "invitee_email", "invitee_phone", "updated_at"])

    if a.invited_by:
        record(
            a.invited_by,
            notification_type=NotificationType.GATE_RESPONSE,
            title=("Gatekeeper accepted" if accept else "Gatekeeper declined"),
            body=f"{_display(request.user)} {'accepted' if accept else 'declined'} "
                 f"your gate invite for {a.event.title}.",
            action_url=f"/host/events/{a.event_id}/gate",
            data={"assignment": str(a.id)},
        )
    return Response({"id": str(a.id), "status": a.status})


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def gate_accept(request, assignment_id):
    return _respond(request, assignment_id, True)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def gate_decline(request, assignment_id):
    return _respond(request, assignment_id, False)
