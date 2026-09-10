"""Scheduled ticketing jobs."""

import logging

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from .models import Order, OrderItem

logger = logging.getLogger(__name__)


def release_expired_orders() -> int:
    """Return seats held by checkouts that were never paid for.

    `create_order` bumps `reserved_quantity` and stamps `expires_at` 15 minutes
    out, but nothing ever swept the expired ones back. Every abandoned checkout
    permanently subtracted from `available_quantity`, so an event drifts towards
    looking sold out while the room is empty.

    Safe to run repeatedly and safe to run concurrently: rows are locked, and
    the status change is what makes the release happen at most once.
    """
    now = timezone.now()
    stale = Order.objects.filter(
        status__in=[Order.Status.INITIATED, Order.Status.PAYMENT_PENDING],
        expires_at__lt=now,
    ).values_list("pk", flat=True)

    released = 0
    for order_id in list(stale):
        with transaction.atomic():
            order = Order.objects.select_for_update().filter(pk=order_id).first()
            if not order:
                continue
            # Re-check under the lock: it may have been paid a moment ago.
            if order.status not in (Order.Status.INITIATED, Order.Status.PAYMENT_PENDING):
                continue
            if order.tickets.exists():
                continue

            for item in order.items.filter(status=OrderItem.Status.ACTIVE):
                tier = item.tier
                tier.reserved_quantity = max(0, tier.reserved_quantity - item.quantity)
                tier.save(update_fields=["reserved_quantity"])

            order.status = Order.Status.EXPIRED
            order.save(update_fields=["status"])
            released += 1

    if released:
        logger.info("Released %s expired ticket order(s).", released)
    return released


@shared_task(name="apps.tickets.tasks.release_expired_orders")
def release_expired_orders_task():
    return release_expired_orders()
