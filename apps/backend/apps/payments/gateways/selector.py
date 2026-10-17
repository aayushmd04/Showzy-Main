"""Chooses which gateway is active.

Rule (deliberately unforgiving): Razorpay is used only when it is *explicitly*
selected AND real credentials are present.  If the operator asks for live and
the credentials are missing, we raise instead of quietly falling back to the
mock — a silent downgrade would mean tickets issued for money that never moved.
"""

from __future__ import annotations

import logging
import os

from django.conf import settings
from django.core.signals import setting_changed
from django.dispatch import receiver

from .base import GatewayConfigurationError, PaymentGateway
from .mock import MockGateway
from .razorpay_gateway import RazorpayGateway

logger = logging.getLogger(__name__)

RAZORPAY = "razorpay"
MOCK = "mock"

#: values that mean "this is not a real credential"
_PLACEHOLDERS = {"", "rzp_test_", "rzp_test_placeholder", "placeholder_secret",
                 "placeholder", "changeme", "none", "null"}

_cache: dict[tuple, PaymentGateway] = {}


def _conf(name: str, default: str = "") -> str:
    """Resolve a config value: Django settings, then the process env / .env file.

    The .env fallback goes through python-decouple (the same reader settings.py
    uses), so `PAYMENT_GATEWAY=razorpay` in .env is honoured even though no
    settings module declares it. Without this, a live switch made only in .env
    would be silently ignored and the mock would keep issuing tickets.
    """
    value = getattr(settings, name, None)
    if value is None:
        value = os.environ.get(name)
    if value is None:
        try:
            from decouple import config as decouple_config

            value = decouple_config(name, default=default)
        except Exception:  # decouple missing or unreadable .env
            value = default
    return (str(value) if value is not None else "").strip()


def _is_real(value: str) -> bool:
    return bool(value) and value.strip().lower() not in _PLACEHOLDERS


def has_live_credentials() -> bool:
    return _is_real(_conf("RAZORPAY_KEY_ID")) and _is_real(_conf("RAZORPAY_KEY_SECRET"))


def active_gateway_name() -> str:
    return (_conf("PAYMENT_GATEWAY", MOCK) or MOCK).lower()


def get_gateway(name: str | None = None) -> PaymentGateway:
    """Return the active gateway instance.

    Cached per resolved configuration, so `override_settings` in tests and a
    changed .env both produce a fresh instance.
    """
    choice = (name or active_gateway_name()).lower()
    key_id = _conf("RAZORPAY_KEY_ID")
    key_secret = _conf("RAZORPAY_KEY_SECRET")
    webhook_secret = _conf("RAZORPAY_WEBHOOK_SECRET")

    if choice == RAZORPAY:
        if not has_live_credentials():
            raise GatewayConfigurationError(
                "PAYMENT_GATEWAY=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET "
                "are missing or still placeholders. Refusing to fall back to the mock "
                "gateway — set real credentials or set PAYMENT_GATEWAY=mock."
            )
        cache_key = (RAZORPAY, key_id, key_secret, webhook_secret)
        if cache_key not in _cache:
            _cache[cache_key] = RazorpayGateway(key_id, key_secret, webhook_secret)
            logger.info("Payment gateway active: Razorpay (live) key_id=%s", key_id)
        return _cache[cache_key]

    if choice == MOCK:
        mock_key = _conf("MOCK_PAYMENT_KEY_ID", "rzp_test_mocknaada001")
        mock_secret = _conf("MOCK_PAYMENT_KEY_SECRET", "naada_mock_secret_dev_only")
        mock_webhook_secret = _conf("MOCK_PAYMENT_WEBHOOK_SECRET") or mock_secret
        forced = _conf("MOCK_PAYMENT_OUTCOME") or None
        cache_key = (MOCK, mock_key, mock_secret, mock_webhook_secret, forced)
        if cache_key not in _cache:
            _cache[cache_key] = MockGateway(
                mock_key, mock_secret, mock_webhook_secret, forced_outcome=forced
            )
            logger.warning(
                "Payment gateway active: MOCK — no real money will move "
                "(forced outcome: %s)", forced or "amount-derived"
            )
        return _cache[cache_key]

    raise GatewayConfigurationError(
        f"Unknown PAYMENT_GATEWAY {choice!r}. Valid values: 'razorpay', 'mock'."
    )


def reset_gateway_cache() -> None:
    _cache.clear()


@receiver(setting_changed)
def _reset_on_setting_change(sender, setting, **kwargs):
    if setting in {
        "PAYMENT_GATEWAY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET", "MOCK_PAYMENT_KEY_ID",
        "MOCK_PAYMENT_KEY_SECRET", "MOCK_PAYMENT_WEBHOOK_SECRET",
        "MOCK_PAYMENT_OUTCOME",
    }:
        reset_gateway_cache()


def log_active_gateway() -> None:
    """Called from AppConfig.ready() so the choice is visible at boot."""
    try:
        gateway = get_gateway()
    except GatewayConfigurationError as exc:
        logger.error("Payment gateway misconfigured: %s", exc)
        return
    logger.info(
        "Showzy payments -> gateway=%s (%s), mock=%s",
        gateway.name, gateway.display_name, gateway.is_mock,
    )
