"""Scheduled ticketing jobs."""

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import Order, OrderItem, ZoneAllocation

logger = logging.getLogger(__name__)


def release_order(order_id) -> bool:
    """Hand back one unpaid order's seats and mark it expired.

    Shared by the sweep below and by `create_order`, which uses it to drop a
    buyer's own abandoned attempt before they start another. Rows are locked
    and the status re-checked, so it releases at most once and never touches an
    order that was paid a moment ago.
    """
    with transaction.atomic():
        order = Order.objects.select_for_update().filter(pk=order_id).first()
        if not order:
            return False
        if order.status not in (Order.Status.INITIATED, Order.Status.PAYMENT_PENDING):
            return False
        if order.tickets.exists():
            return False

        for item in order.items.filter(status=OrderItem.Status.ACTIVE):
            tier = item.tier
            tier.reserved_quantity = max(0, tier.reserved_quantity - item.quantity)
            tier.save(update_fields=["reserved_quantity"])

        allocation = ZoneAllocation.objects.filter(
            order=order, status=ZoneAllocation.Status.HELD
        ).first()
        if allocation:
            allocation.release()

        order.status = Order.Status.EXPIRED
        order.save(update_fields=["status"])
        return True


def release_expired_orders() -> int:
    """Return seats held by checkouts that were never paid for.

    `create_order` bumps `reserved_quantity` and stamps `expires_at` 15 minutes
    out, but nothing ever swept the expired ones back. Every abandoned checkout
    permanently subtracted from `available_quantity`, so an event drifts towards
    looking sold out while the room is empty.

    The same applies to a floor-plan zone: an abandoned checkout that had
    claimed the good table by the stage gives it back here, so the next buyer
    can have it.

    Safe to run repeatedly and safe to run concurrently: rows are locked, and
    the status change is what makes the release happen at most once.
    """
    now = timezone.now()
    stale = Order.objects.filter(
        status__in=[Order.Status.INITIATED, Order.Status.PAYMENT_PENDING],
        expires_at__lt=now,
    ).values_list("pk", flat=True)

    released = sum(1 for order_id in list(stale) if release_order(order_id))

    if released:
        logger.info("Released %s expired ticket order(s).", released)
    return released


@shared_task(name="apps.tickets.tasks.release_expired_orders")
def release_expired_orders_task():
    return release_expired_orders()
