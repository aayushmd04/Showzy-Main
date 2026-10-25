"""The real Razorpay gateway.

Nothing in here is dev-only or conditional — this is the code that runs the
day the merchant account is approved.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from .base import (
    GatewayError,
    PaymentGateway,
    hmac_sha256,
    to_paise,
)

logger = logging.getLogger(__name__)


class RazorpayGateway(PaymentGateway):
    name = "razorpay"
    display_name = "Razorpay"
    is_mock = False

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str = ""):
        if not key_id or not key_secret:
            raise GatewayError("RazorpayGateway requires both key id and key secret.")
        self.key_id = key_id
        self.key_secret = key_secret
        # Razorpay lets you set a webhook secret independent of the API secret.
        self.webhook_secret = webhook_secret or key_secret
        self._client = None

    # ── identity ─────────────────────────────────────────────────────────────
    @property
    def public_key(self) -> str:
        return self.key_id

    @property
    def client(self):
        if self._client is None:
            import razorpay  # imported lazily so the mock path needs no SDK

            self._client = razorpay.Client(auth=(self.key_id, self.key_secret))
        return self._client

    # ── operations ───────────────────────────────────────────────────────────
    def create_order(self, order) -> dict:
        try:
            return self.client.order.create({
                "amount": to_paise(order.total_amount),
                "currency": order.currency,
                "receipt": str(order.id)[:40],
                "notes": {"order_id": str(order.id), "user": order.user.email},
            })
        except Exception as exc:  # razorpay raises its own exception hierarchy
            logger.exception("Razorpay order.create failed for order %s", order.id)
            raise GatewayError(f"Razorpay order creation failed: {exc}") from exc

    def create_escrow_order(self, booking_order) -> dict:
        try:
            return self.client.order.create({
                "amount": to_paise(booking_order.gross_amount),
                "currency": booking_order.currency,
                "receipt": f"bk-{booking_order.id}"[:40],
                "notes": {"booking_order_id": str(booking_order.id)},
            })
        except Exception as exc:
            logger.exception("Razorpay order.create failed for booking order %s", booking_order.id)
            raise GatewayError(f"Razorpay order creation failed: {exc}") from exc

    def verify_signature(self, payload: dict) -> bool:
        """order_id|payment_id signed with the key secret — Razorpay's spec."""
        order_id = payload.get("order_id") or ""
        payment_id = payload.get("payment_id") or ""
        signature = payload.get("signature") or ""
        if not (order_id and payment_id and signature):
            return False
        expected = hmac_sha256(self.key_secret, f"{order_id}|{payment_id}")
        return _constant_time_equals(expected, signature)

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        if not signature:
            return False
        expected = hmac_sha256(self.webhook_secret, raw_body or b"")
        return _constant_time_equals(expected, signature)

    def fetch_payment(self, payment_id: str) -> dict:
        try:
            return self.client.payment.fetch(payment_id)
        except Exception as exc:
            raise GatewayError(f"Razorpay payment.fetch failed: {exc}") from exc

    def refund(self, payment, amount: Decimal, notes: dict | None = None) -> dict:
        if not payment.gateway_payment_id:
            raise GatewayError("Payment has no gateway payment id; cannot refund.")
        try:
            return self.client.payment.refund(payment.gateway_payment_id, {
                "amount": to_paise(amount),
                "speed": "normal",
                "notes": notes or {},
            })
        except Exception as exc:
            logger.exception("Razorpay refund failed for payment %s", payment.pk)
            raise GatewayError(f"Razorpay refund failed: {exc}") from exc


def _constant_time_equals(a: str, b: str) -> bool:
    import hmac as _hmac

    return _hmac.compare_digest(a, b)
