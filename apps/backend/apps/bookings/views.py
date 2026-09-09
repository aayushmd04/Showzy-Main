"""
Marketplace B — Host ↔ Artist booking with escrow.
Every money-moving endpoint uses DB transactions + idempotency guards.
"""
import hashlib
import hmac
import logging
from decimal import Decimal
from django.conf import settings as django_settings
from django.db import transaction
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from .models import (
    Organizer, Membership, GigApplication,
    BookingConversation, BookingMessage, Offer, BookingOrder,
    Transfer, LedgerEntry, Dispute, BookingAuditLog,
)
from .serializers import (
    OrganizerSerializer, MembershipSerializer, GigApplicationSerializer,
    BookingConversationSerializer, BookingMessageSerializer, OfferSerializer,
    BookingOrderSerializer, LedgerEntrySerializer, DisputeSerializer,
    FundOrderSerializer, MakeOfferSerializer, compute_fees,
)

logger = logging.getLogger(__name__)


# ─── Organizer ──────────────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def organizers(request):
    if request.method == "GET":
        ids = request.user.memberships.filter(is_active=True).values_list("organizer_id", flat=True)
        qs = Organizer.objects.filter(id__in=ids, is_deleted=False)
        return Response(OrganizerSerializer(qs, many=True).data)

    ser = OrganizerSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    with transaction.atomic():
        org = ser.save()
        Membership.objects.create(user=request.user, organizer=org, role=Membership.Role.OWNER)
    return Response(OrganizerSerializer(org).data, status=201)


@api_view(["GET", "PATCH"])
@permission_classes([permissions.IsAuthenticated])
def organizer_detail(request, pk):
    org = Organizer.objects.filter(pk=pk, is_deleted=False).first()
    if not org:
        return Response({"detail": "Not found."}, status=404)
    if request.method == "GET":
        return Response(OrganizerSerializer(org).data)
    _assert_member(request.user, org, required_role="manager")
    ser = OrganizerSerializer(org, data=request.data, partial=True)
    ser.is_valid(raise_exception=True)
    ser.save()
    return Response(OrganizerSerializer(org).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def add_member(request, pk):
    org = Organizer.objects.filter(pk=pk, is_deleted=False).first()
    if not org:
        return Response({"detail": "Not found."}, status=404)
    _assert_member(request.user, org, required_role="owner")
    from apps.users.models import User
    target_user = User.objects.filter(email=request.data.get("email")).first()
    if not target_user:
        return Response({"detail": "User not found."}, status=404)
    role = request.data.get("role", "staff")
    mem, created = Membership.objects.get_or_create(
        user=target_user, organizer=org,
        defaults={"role": role, "invited_by": request.user}
    )
    if not created:
        mem.role = role
        mem.is_active = True
        mem.save(update_fields=["role", "is_active"])
    return Response(MembershipSerializer(mem).data, status=201 if created else 200)


# ─── GigApplication ─────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def apply_to_gig(request):
    """Artist applies to an event marked as seeking performers."""
    from apps.artists.models import Artist
    from apps.events.models import Event

    artist = Artist.objects.filter(user=request.user).first()
    if not artist:
        return Response({"detail": "You don't have an artist profile."}, status=403)

    event = Event.objects.filter(pk=request.data.get("event"), is_seeking_artists=True).first()
    if not event:
        return Response({"detail": "Event not found or not seeking artists."}, status=404)

    app, created = GigApplication.objects.get_or_create(
        event=event, artist=artist,
        defaults={
            "proposed_fee": request.data.get("proposed_fee"),
            "note": request.data.get("note", ""),
        }
    )
    if not created:
        return Response({"detail": "You already applied to this event."}, status=409)
    return Response(GigApplicationSerializer(app).data, status=201)


@api_view(["PATCH"])
@permission_classes([permissions.IsAuthenticated])
def review_application(request, pk):
    """Host shortlists / accepts / rejects an application."""
    app = GigApplication.objects.filter(pk=pk).first()
    if not app:
        return Response({"detail": "Not found."}, status=404)
    _assert_event_organizer(request.user, app.event)
    new_status = request.data.get("status")
    if new_status not in ["shortlisted", "rejected", "accepted"]:
        return Response({"detail": "status must be shortlisted, rejected, or accepted."}, status=400)
    app.status = new_status
    app.reviewed_at = timezone.now()
    app.reviewed_by = request.user
    app.save(update_fields=["status", "reviewed_at", "reviewed_by"])
    return Response(GigApplicationSerializer(app).data)


# ─── BookingConversation ─────────────────────────────────────────────────────

@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def conversations(request):
    if request.method == "GET":
        from apps.artists.models import Artist
        artist = Artist.objects.filter(user=request.user).first()
        org_ids = request.user.memberships.filter(is_active=True).values_list("organizer_id", flat=True)
        qs = BookingConversation.objects.filter(
            models_Q(organizer_id__in=org_ids) | models_Q(artist=artist)
        ).select_related("organizer", "artist").order_by("-last_message_at")
        return Response(BookingConversationSerializer(qs, many=True).data)

    # POST — open a conversation (host initiates)
    org_id = request.data.get("organizer")
    artist_id = request.data.get("artist")
    event_id = request.data.get("event")
    org = Organizer.objects.filter(pk=org_id, is_deleted=False).first()
    if not org:
        return Response({"detail": "Organizer not found."}, status=404)
    _assert_member(request.user, org, required_role="staff")
    from apps.artists.models import Artist
    artist = Artist.objects.filter(pk=artist_id).first()
    if not artist:
        return Response({"detail": "Artist not found."}, status=404)
    convo, _ = BookingConversation.objects.get_or_create(
        organizer=org, artist=artist,
        event_id=event_id if event_id else None,
        defaults={"initiated_by": request.user}
    )
    return Response(BookingConversationSerializer(convo).data, status=201)


@api_view(["GET", "POST"])
@permission_classes([permissions.IsAuthenticated])
def conversation_messages(request, convo_id):
    convo = BookingConversation.objects.filter(pk=convo_id).first()
    if not convo:
        return Response({"detail": "Not found."}, status=404)
    _assert_conversation_participant(request.user, convo)

    if request.method == "GET":
        msgs = convo.messages.filter(is_deleted=False).select_related("sender")
        return Response(BookingMessageSerializer(msgs, many=True).data)

    content = request.data.get("content", "").strip()
    if not content:
        return Response({"detail": "content is required."}, status=400)

    msg = BookingMessage.objects.create(
        conversation=convo,
        sender=request.user,
        content=content,
    )
    convo.last_message_at = timezone.now()
    convo.save(update_fields=["last_message_at"])
    return Response(BookingMessageSerializer(msg).data, status=201)


# ─── Offer ──────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def make_offer(request, convo_id):
    convo = BookingConversation.objects.filter(pk=convo_id).first()
    if not convo:
        return Response({"detail": "Not found."}, status=404)
    _assert_conversation_participant(request.user, convo)

    ser = MakeOfferSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data

    # If counter_of is provided, mark the original as countered
    counter_of_obj = None
    if d.get("counter_of"):
        counter_of_obj = Offer.objects.filter(pk=d["counter_of"], conversation=convo).first()
        if counter_of_obj and counter_of_obj.status == Offer.Status.PENDING:
            counter_of_obj.status = Offer.Status.COUNTERED
            counter_of_obj.responded_by = request.user
            counter_of_obj.responded_at = timezone.now()
            counter_of_obj.save(update_fields=["status", "responded_by", "responded_at"])

    offer = Offer.objects.create(
        conversation=convo,
        proposed_by=request.user,
        fee_amount=d["fee_amount"],
        performance_date=d["performance_date"],
        performance_duration_minutes=d["performance_duration_minutes"],
        set_count=d["set_count"],
        notes=d.get("notes", ""),
        counter_of=counter_of_obj,
        expires_at=timezone.now() + timezone.timedelta(hours=48),
    )
    # Post an Offer-type system message in the conversation
    BookingMessage.objects.create(
        conversation=convo, sender=request.user,
        content=f"Offer: ₹{offer.fee_amount} for {offer.performance_date}",
        message_type=BookingMessage.MsgType.OFFER,
        linked_offer=offer,
    )
    return Response(OfferSerializer(offer).data, status=201)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def accept_offer(request, offer_id):
    """Accept an offer → creates BookingOrder. Checks for artist double-booking."""
    offer = Offer.objects.filter(pk=offer_id, status=Offer.Status.PENDING).first()
    if not offer:
        return Response({"detail": "Offer not found or not pending."}, status=404)
    convo = offer.conversation
    _assert_conversation_participant(request.user, convo)

    # Only the receiving party can accept (not the proposer)
    if offer.proposed_by == request.user:
        return Response({"detail": "You cannot accept your own offer."}, status=400)

    gross = offer.fee_amount
    platform_fee, tds, artist_payout = compute_fees(gross)

    with transaction.atomic():
        # Double-booking guard
        temp_order = BookingOrder(
            artist=convo.artist,
            performance_date=offer.performance_date,
        )
        if temp_order.is_double_booked():
            return Response(
                {"detail": f"Artist is already booked on {offer.performance_date}."},
                status=409
            )

        # Mark offer accepted
        offer.status = Offer.Status.ACCEPTED
        offer.responded_by = request.user
        offer.responded_at = timezone.now()
        offer.save(update_fields=["status", "responded_by", "responded_at"])

        order = BookingOrder.objects.create(
            offer=offer,
            organizer=convo.organizer,
            artist=convo.artist,
            event=convo.event,
            gross_amount=gross,
            platform_fee=platform_fee,
            tds_amount=tds,
            artist_payout=artist_payout,
            performance_date=offer.performance_date,
            performance_duration_minutes=offer.performance_duration_minutes,
        )
        BookingAuditLog.objects.create(
            booking_order=order,
            actor=request.user,
            new_status=BookingOrder.Status.ACCEPTED,
            note="Offer accepted — BookingOrder created",
        )

    # Schedule KYC nudge for artist (best-effort — no Redis in dev is fine)
    try:
        from .tasks import kyc_nudge
        result = kyc_nudge.apply_async((str(order.id), 1), countdown=86400)
        order.kyc_nudge_task_id = result.id
        order.save(update_fields=["kyc_nudge_task_id"])
    except Exception as exc:
        logger.warning("Could not schedule kyc_nudge (no broker?): %s", exc)

    return Response(BookingOrderSerializer(order).data, status=201)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def reject_offer(request, offer_id):
    offer = Offer.objects.filter(pk=offer_id, status=Offer.Status.PENDING).first()
    if not offer:
        return Response({"detail": "Offer not found or not pending."}, status=404)
    _assert_conversation_participant(request.user, offer.conversation)
    if offer.proposed_by == request.user:
        # Proposer withdraws
        offer.status = Offer.Status.WITHDRAWN
    else:
        offer.status = Offer.Status.REJECTED
    offer.responded_by = request.user
    offer.responded_at = timezone.now()
    offer.save(update_fields=["status", "responded_by", "responded_at"])
    return Response(OfferSerializer(offer).data)


# ─── BookingOrder ────────────────────────────────────────────────────────────

@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def booking_orders(request):
    from apps.artists.models import Artist
    artist = Artist.objects.filter(user=request.user).first()
    org_ids = request.user.memberships.filter(is_active=True).values_list("organizer_id", flat=True)
    from django.db.models import Q
    qs = BookingOrder.objects.filter(
        Q(organizer_id__in=org_ids) | Q(artist=artist)
    ).select_related("organizer", "artist", "event").order_by("-created_at")
    return Response(BookingOrderSerializer(qs, many=True).data)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def booking_order_detail(request, pk):
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    return Response(BookingOrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def fund_order(request, pk):
    """
    Host funds escrow — receives Razorpay payment details from frontend checkout.
    Verifies HMAC signature, creates Transfer record, transitions order to funded,
    writes LedgerEntry rows, schedules 72h auto-release task.
    """
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    if order.status != BookingOrder.Status.ACCEPTED:
        return Response({"detail": f"Order is in '{order.status}' — cannot fund."}, status=400)

    ser = FundOrderSerializer(data=request.data)
    ser.is_valid(raise_exception=True)
    d = ser.validated_data

    # HMAC verification (skip in dev if key is placeholder)
    key_secret = django_settings.RAZORPAY_KEY_SECRET
    is_dev = not key_secret or django_settings.RAZORPAY_KEY_ID in ("rzp_test_", "")
    if not is_dev:
        body = f"{d['razorpay_order_id']}|{d['razorpay_payment_id']}"
        expected = hmac.new(key_secret.encode(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, d["razorpay_signature"]):
            return Response({"detail": "Invalid payment signature."}, status=400)

    with transaction.atomic():
        # Idempotency — if payment_id already linked, return the order as-is
        if order.razorpay_payment_id == d["razorpay_payment_id"]:
            return Response(BookingOrderSerializer(order).data)

        order.razorpay_order_id = d["razorpay_order_id"]
        order.razorpay_payment_id = d["razorpay_payment_id"]
        order.save(update_fields=["razorpay_order_id", "razorpay_payment_id"])
        order.transition(BookingOrder.Status.FUNDED, actor=request.user,
                         ip=request.META.get("REMOTE_ADDR"))

        # Create Transfer record (on_hold=True — released after host confirms or 72h)
        Transfer.objects.create(
            booking_order=order,
            razorpay_transfer_id=f"transfer_DEV_{order.id.hex[:12]}" if is_dev else d["razorpay_payment_id"],
            razorpay_payment_id=d["razorpay_payment_id"],
            amount=order.artist_payout,
            on_hold=True,
            recipient_account_id=order.artist.user.email,  # replace with Linked Account ID post-KYC
        )

        # Write ledger entries
        LedgerEntry.objects.bulk_create([
            LedgerEntry(booking_order=order, entry_type=LedgerEntry.EntryType.GROSS_CHARGE,
                        amount=order.gross_amount, description="Host payment", reference_id=d["razorpay_payment_id"]),
            LedgerEntry(booking_order=order, entry_type=LedgerEntry.EntryType.PLATFORM_FEE,
                        amount=-order.platform_fee, description="Platform commission"),
            LedgerEntry(booking_order=order, entry_type=LedgerEntry.EntryType.TDS,
                        amount=-order.tds_amount, description="TDS (194-O)"),
            LedgerEntry(booking_order=order, entry_type=LedgerEntry.EntryType.ARTIST_PAYOUT,
                        amount=-order.artist_payout, description="Artist payout (held)"),
        ])

    # Schedule 72h auto-release (best-effort — no Redis in dev is fine)
    try:
        from .tasks import auto_release_booking
        result = auto_release_booking.apply_async((str(order.id),), countdown=72 * 3600)
        order.auto_release_task_id = result.id
        order.save(update_fields=["auto_release_task_id"])
    except Exception as exc:
        logger.warning("Could not schedule auto_release_booking (no broker?): %s", exc)

    return Response(BookingOrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def complete_order(request, pk):
    """Host confirms gig happened — releases escrow hold."""
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    if order.status not in [BookingOrder.Status.IN_PROGRESS, BookingOrder.Status.FUNDED]:
        return Response({"detail": f"Cannot complete order in '{order.status}' state."}, status=400)
    if not _is_organizer_member(request.user, order.organizer):
        return Response({"detail": "Only the host can confirm completion."}, status=403)

    with transaction.atomic():
        order.transition(BookingOrder.Status.COMPLETED, actor=request.user,
                         reason="Host confirmed completion", ip=request.META.get("REMOTE_ADDR"))
        order.transition(BookingOrder.Status.RELEASED, actor=request.user, reason="Escrow hold released")
        # TODO: call Razorpay Route API — patch transfer on_hold=False
        Transfer.objects.filter(booking_order=order, on_hold=True).update(
            on_hold=False, hold_released_at=timezone.now()
        )

    return Response(BookingOrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def cancel_order(request, pk):
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    if not order.can_transition_to(BookingOrder.Status.CANCELLED):
        return Response({"detail": f"Cannot cancel order in '{order.status}' state."}, status=400)
    reason = request.data.get("reason", "")
    with transaction.atomic():
        order.transition(BookingOrder.Status.CANCELLED, actor=request.user, reason=reason)
        # Revoke the auto-release task if it was scheduled
        if order.auto_release_task_id:
            try:
                from naada.celery import app as celery_app
                celery_app.control.revoke(order.auto_release_task_id)
            except Exception:
                pass
    return Response(BookingOrderSerializer(order).data)


@api_view(["POST"])
@permission_classes([permissions.IsAuthenticated])
def raise_dispute(request, pk):
    """Either party can raise a dispute. Immediately suspends the auto-release timer."""
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    if not order.can_transition_to(BookingOrder.Status.DISPUTED):
        return Response({"detail": f"Cannot dispute order in '{order.status}' state."}, status=400)
    if hasattr(order, "dispute"):
        return Response({"detail": "Dispute already raised."}, status=409)

    reason = request.data.get("reason", "").strip()
    if not reason:
        return Response({"detail": "reason is required."}, status=400)

    with transaction.atomic():
        order.transition(BookingOrder.Status.DISPUTED, actor=request.user,
                         reason=f"Dispute raised: {reason}", ip=request.META.get("REMOTE_ADDR"))
        dispute = Dispute.objects.create(
            booking_order=order,
            raised_by=request.user,
            reason=reason,
            evidence_urls=request.data.get("evidence_urls", []),
        )

    return Response(DisputeSerializer(dispute).data, status=201)


@api_view(["GET"])
@permission_classes([permissions.IsAuthenticated])
def order_ledger(request, pk):
    order = _get_order_for_user(request.user, pk)
    if not order:
        return Response({"detail": "Not found."}, status=404)
    entries = order.ledger_entries.all()
    return Response(LedgerEntrySerializer(entries, many=True).data)


# ─── Admin — dispute resolution ───────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([permissions.IsAdminUser])
def resolve_dispute(request, dispute_id):
    """Admin resolves dispute by choosing release / refund / split."""
    dispute = Dispute.objects.filter(pk=dispute_id).first()
    if not dispute:
        return Response({"detail": "Not found."}, status=404)
    if dispute.resolution != Dispute.Resolution.PENDING:
        return Response({"detail": "Already resolved."}, status=400)

    resolution = request.data.get("resolution")
    if resolution not in [Dispute.Resolution.RELEASE, Dispute.Resolution.REFUND, Dispute.Resolution.SPLIT]:
        return Response({"detail": "resolution must be release, refund, or split."}, status=400)

    with transaction.atomic():
        dispute.resolution = resolution
        dispute.split_artist_pct = request.data.get("split_artist_pct")
        dispute.admin_notes = request.data.get("admin_notes", "")
        dispute.resolved_by = request.user
        dispute.resolved_at = timezone.now()
        dispute.save()

        order = dispute.booking_order
        if resolution == Dispute.Resolution.RELEASE:
            order.transition(BookingOrder.Status.COMPLETED, actor=request.user, reason=f"Admin resolved: {resolution}")
            order.transition(BookingOrder.Status.RELEASED, actor=request.user)
            Transfer.objects.filter(booking_order=order, on_hold=True).update(
                on_hold=False, hold_released_at=timezone.now()
            )
        elif resolution == Dispute.Resolution.REFUND:
            order.transition(BookingOrder.Status.REFUNDED, actor=request.user, reason="Admin resolved: full refund to host")
        elif resolution == Dispute.Resolution.SPLIT:
            order.transition(BookingOrder.Status.PARTIALLY_REFUNDED, actor=request.user,
                             reason=f"Admin resolved: split {dispute.split_artist_pct}% to artist")

    return Response(DisputeSerializer(dispute).data)


@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def dispute_queue(request):
    """Admin view of all open disputes."""
    disputes = Dispute.objects.filter(resolution=Dispute.Resolution.PENDING).select_related(
        "booking_order", "raised_by"
    ).order_by("created_at")
    return Response(DisputeSerializer(disputes, many=True).data)


@api_view(["GET"])
@permission_classes([permissions.IsAdminUser])
def flagged_messages(request):
    """Admin view of contact-info flagged messages (disintermediation monitor)."""
    msgs = BookingMessage.objects.filter(is_flagged=True, is_deleted=False).select_related(
        "conversation", "sender"
    ).order_by("-created_at")[:100]
    return Response(BookingMessageSerializer(msgs, many=True).data)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _assert_member(user, organizer, required_role="staff"):
    roles = {"staff": 0, "manager": 1, "owner": 2}
    mem = organizer.memberships.filter(user=user, is_active=True).first()
    if not mem or roles.get(mem.role, -1) < roles.get(required_role, 0):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied(f"You need '{required_role}' role on this organizer.")


def _is_organizer_member(user, organizer):
    return organizer.memberships.filter(user=user, is_active=True).exists()


def _assert_conversation_participant(user, convo):
    from apps.artists.models import Artist
    is_artist = Artist.objects.filter(user=user, id=convo.artist_id).exists()
    is_host = _is_organizer_member(user, convo.organizer)
    if not (is_artist or is_host):
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You are not a participant in this conversation.")


def _assert_event_organizer(user, event):
    from apps.artists.models import Artist
    org_ids = user.memberships.filter(is_active=True).values_list("organizer_id", flat=True)
    if event.organizer_id not in org_ids:
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied("You don't manage this event.")


def _get_order_for_user(user, pk):
    from apps.artists.models import Artist
    from django.db.models import Q
    artist = Artist.objects.filter(user=user).first()
    org_ids = user.memberships.filter(is_active=True).values_list("organizer_id", flat=True)
    return BookingOrder.objects.filter(
        Q(organizer_id__in=org_ids) | Q(artist=artist), pk=pk
    ).first()


# Fix missing import at module level
from django.db.models import Q as models_Q
