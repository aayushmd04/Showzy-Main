"""
Celery tasks for Marketplace B — booking/escrow lifecycle automation.
  • auto_release_booking  — fires 72h after funding (skips if disputed)
  • kyc_nudge            — nudges artist at 24h/72h/7d, auto-refunds at 14d
  • nightly_reconciliation — asserts every funded booking has a matching transfer + balanced ledger
"""
import logging
from decimal import Decimal
from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 72-hour auto-release
# ---------------------------------------------------------------------------

@shared_task(bind=True, max_retries=3, default_retry_delay=300)
def auto_release_booking(self, booking_order_id: str):
    """
    Triggered 72h after escrow is funded.
    CRITICAL: must check status=disputed and bail — release timer is suspended while disputed.
    """
    from django.db import transaction
    from apps.bookings.models import BookingOrder

    try:
        with transaction.atomic():
            # Lock the row
            order = BookingOrder.objects.select_for_update().get(pk=booking_order_id)

            if order.status == BookingOrder.Status.DISPUTED:
                logger.warning(
                    f"[auto_release] BLOCKED — order {booking_order_id} is DISPUTED. "
                    "Timer suspended. Admin must resolve."
                )
                return {"skipped": "disputed"}

            if order.status not in [BookingOrder.Status.IN_PROGRESS, BookingOrder.Status.FUNDED]:
                logger.info(
                    f"[auto_release] Skipped — order {booking_order_id} already in '{order.status}'"
                )
                return {"skipped": order.status}

            order.transition(BookingOrder.Status.COMPLETED, reason="72h auto-release timer")
            order.transition(BookingOrder.Status.RELEASED, reason="Auto-release: escrow hold lifted")
            logger.info(f"[auto_release] Released BookingOrder {booking_order_id}")

            # TODO: call Razorpay Route API to release hold on Transfer
            # razorpay_client.transfer.patch(order.razorpay_transfer_id, {"on_hold": False})

            return {"released": booking_order_id}

    except BookingOrder.DoesNotExist:
        logger.error(f"[auto_release] BookingOrder {booking_order_id} not found")
    except Exception as exc:
        logger.error(f"[auto_release] Error on {booking_order_id}: {exc}", exc_info=True)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# KYC nudge — artist must complete Razorpay Linked Account before payout
# ---------------------------------------------------------------------------

NUDGE_SCHEDULE_DAYS = [1, 3, 7]  # nudge 1 at +1d, nudge 2 at +3d, nudge 3 at +7d
KYC_AUTO_REFUND_DAYS = 14


@shared_task(bind=True, max_retries=5)
def kyc_nudge(self, booking_order_id: str, nudge_number: int):
    """
    Nudges artist to complete KYC. Auto-refunds host at nudge 4 (14d).
    """
    from apps.bookings.models import BookingOrder
    from apps.notifications.models import Notification

    try:
        order = BookingOrder.objects.get(pk=booking_order_id)

        # Only act if still stuck at accepted (KYC not done)
        if order.status != BookingOrder.Status.ACCEPTED:
            logger.info(f"[kyc_nudge] Order {booking_order_id} no longer in accepted state — stopping nudges")
            return

        artist_user = order.artist.user

        if nudge_number >= 4:
            # 14 days — auto-refund host
            logger.warning(f"[kyc_nudge] 14d elapsed — auto-refunding host for order {booking_order_id}")
            order.transition(
                BookingOrder.Status.REFUNDED,
                reason="Artist KYC not completed within 14 days — automatic refund to host"
            )
            # Notify host
            host_user = order.organizer.memberships.filter(role="owner", is_active=True).first()
            if host_user:
                Notification.objects.create(
                    user=host_user.user,
                    notification_type="BOOKING_AUTO_REFUNDED",
                    title="Booking cancelled — artist KYC incomplete",
                    body=(
                        f"Your booking for {order.performance_date} with {order.artist} "
                        f"has been automatically cancelled and ₹{order.gross_amount} refunded. "
                        "The artist did not complete payment setup within 14 days."
                    ),
                )
            return

        # Nudge artist
        Notification.objects.create(
            user=artist_user,
            notification_type="KYC_NUDGE",
            title="Action needed: complete your payout setup",
            body=(
                f"Your booking on {order.performance_date} pays ₹{order.artist_payout}. "
                f"Complete your payment account setup to confirm. "
                f"You have {KYC_AUTO_REFUND_DAYS - NUDGE_SCHEDULE_DAYS[nudge_number - 1]} days left."
            ),
        )
        logger.info(f"[kyc_nudge] Sent nudge #{nudge_number} to {artist_user.email} for order {booking_order_id}")

        # Schedule next nudge
        next_nudge = nudge_number + 1
        if next_nudge <= 3:
            next_delay_days = NUDGE_SCHEDULE_DAYS[next_nudge - 1] - NUDGE_SCHEDULE_DAYS[nudge_number - 1]
        else:
            next_delay_days = KYC_AUTO_REFUND_DAYS - NUDGE_SCHEDULE_DAYS[-1]

        kyc_nudge.apply_async(
            (booking_order_id, next_nudge),
            countdown=next_delay_days * 86400
        )

    except BookingOrder.DoesNotExist:
        logger.error(f"[kyc_nudge] BookingOrder {booking_order_id} not found")
    except Exception as exc:
        logger.error(f"[kyc_nudge] Error: {exc}", exc_info=True)
        raise self.retry(exc=exc)


# ---------------------------------------------------------------------------
# Nightly reconciliation job
# ---------------------------------------------------------------------------

@shared_task
def nightly_reconciliation():
    """
    Runs nightly. Asserts:
    1. Every funded/in-progress booking has at least one Transfer record.
    2. Ledger entries net to ~zero per booking.
    3. No booking is stuck in 'accepted' (unfunded) >24h (KYC watch).
    """
    from apps.bookings.models import BookingOrder, Transfer, LedgerEntry

    issues = []
    now = timezone.now()

    # 1. Funded orders without a Transfer record
    funded_qs = BookingOrder.objects.filter(
        status__in=[BookingOrder.Status.FUNDED, BookingOrder.Status.IN_PROGRESS]
    )
    for order in funded_qs:
        if not Transfer.objects.filter(booking_order=order).exists():
            issues.append(
                f"MISSING_TRANSFER: BookingOrder {order.id} status={order.status} "
                f"funded_at={order.funded_at} has no Transfer record"
            )

    # 2. Ledger math — net should be ~0 per completed/released booking
    for order in BookingOrder.objects.filter(status__in=[
        BookingOrder.Status.COMPLETED, BookingOrder.Status.RELEASED, BookingOrder.Status.SETTLED
    ]):
        entries = LedgerEntry.objects.filter(booking_order=order)
        net = sum(e.amount for e in entries)
        if abs(net) > Decimal("1"):
            issues.append(
                f"LEDGER_MISMATCH: BookingOrder {order.id} ledger net={net} (expected ≈0)"
            )

    # 3. Orders stuck in 'accepted' >24h (artist likely hasn't been notified)
    stale_accepted = BookingOrder.objects.filter(
        status=BookingOrder.Status.ACCEPTED,
        created_at__lt=now - timezone.timedelta(hours=24)
    )
    for order in stale_accepted:
        issues.append(
            f"STALE_ACCEPTED: BookingOrder {order.id} has been accepted for "
            f"{(now - order.created_at).days}d without funding"
        )

    # 4. Auto-release overdue (funded > 80h, still not released, not disputed)
    overdue_qs = BookingOrder.objects.filter(
        status__in=[BookingOrder.Status.FUNDED, BookingOrder.Status.IN_PROGRESS],
        auto_release_at__lt=now - timezone.timedelta(hours=8),
    ).exclude(status=BookingOrder.Status.DISPUTED)
    for order in overdue_qs:
        issues.append(
            f"OVERDUE_RELEASE: BookingOrder {order.id} auto_release_at={order.auto_release_at} "
            "has passed but order is not yet released"
        )

    if issues:
        logger.error(f"[reconciliation] {len(issues)} issue(s) found:\n" + "\n".join(issues))
        # TODO: fire an alert to admin (email / Slack / PagerDuty)
    else:
        logger.info(f"[reconciliation] Clean — checked at {now.isoformat()}")

    return {"issues_count": len(issues), "issues": issues, "checked_at": now.isoformat()}
