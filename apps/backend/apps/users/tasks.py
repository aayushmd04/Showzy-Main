"""Housekeeping for the users app."""

import logging
from datetime import timedelta

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task
def purge_old_otp_tokens(max_age_hours: int = 24):
    """Delete sign-in codes long past expiry.

    They are useless after a few minutes, but each row still ties an email
    address to an IP, so there is no reason to keep them. The window is a day,
    not minutes, so the resend cooldown and abuse investigation still see
    recent history.
    """
    from .models import OTPToken

    deleted, _ = OTPToken.objects.filter(
        created_at__lt=timezone.now() - timedelta(hours=max_age_hours)
    ).delete()
    logger.info("Purged %s old OTP tokens", deleted)
    return deleted
