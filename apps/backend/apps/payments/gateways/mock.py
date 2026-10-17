"""A faithful Razorpay simulator.

The point of this class is *not* to be a stub.  It is to be indistinguishable
from Razorpay at the interface boundary, so that the code paths exercised
tonight are the same code paths that will run against live Razorpay:

* ids are shaped like Razorpay's (``order_<14 alnum>``, ``pay_<14 alnum>``,
  ``rfnd_<14 alnum>``);
* entity dicts carry Razorpay's field names and value vocabulary;
* signatures are REAL HMAC-SHA256 over ``order_id|payment_id``, generated with
  a local mock secret and verified through the same code path as production.
  Verification is never skipped.

Deterministic outcomes (so the frontend can demo failure states)
---------------------------------------------------------------
The outcome of a mock payment is decided by the *paise* part of the order
total, which makes it reproducible without any extra plumbing:

    ₹500.00  (paise ..00)  -> success   (payment captured)
    ₹500.01  (paise ..01)  -> failed    (checkout returns a Razorpay error)
    ₹500.02  (paise ..02)  -> pending   (payment authorized-but-not-captured)

Two overrides exist, both mock-only:

* ``MOCK_PAYMENT_OUTCOME`` (setting or env) = ``success`` | ``failed`` |
  ``pending`` forces every mock payment to that outcome;
* the mock checkout endpoint accepts an explicit ``outcome`` field, which lets
  a demo UI drive any state on demand.
"""

from __future__ import annotations

import logging
import random
import string
import time
from decimal import Decimal

from .base import (
    GatewayError,
    PaymentGateway,
    hmac_sha256,
    to_paise,
)

logger = logging.getLogger(__name__)

_ALNUM = string.ascii_letters + string.digits

#: outcome vocabulary shared with the views / mock checkout endpoint
OUTCOME_SUCCESS = "success"
OUTCOME_FAILED = "failed"
OUTCOME_PENDING = "pending"
OUTCOMES = (OUTCOME_SUCCESS, OUTCOME_FAILED, OUTCOME_PENDING)


def _rzp_id(prefix: str) -> str:
    """Razorpay ids are `<prefix>_` + 14 alphanumeric characters."""
    return f"{prefix}_" + "".join(random.choices(_ALNUM, k=14))


class MockGateway(PaymentGateway):
    name = "mock"
    display_name = "Mock Gateway (no real money)"
    is_mock = True

    def __init__(self, key_id: str, key_secret: str, webhook_secret: str = "",
                 forced_outcome: str | None = None):
        self.key_id = key_id
        self.key_secret = key_secret
        self.webhook_secret = webhook_secret or key_secret
        if forced_outcome and forced_outcome not in OUTCOMES:
            raise GatewayError(
                f"MOCK_PAYMENT_OUTCOME must be one of {OUTCOMES}, got {forced_outcome!r}."
            )
        self.forced_outcome = forced_outcome

    # ── identity ─────────────────────────────────────────────────────────────
    @property
    def public_key(self) -> str:
        return self.key_id

    # ── deterministic outcome rules ──────────────────────────────────────────
    def outcome_for_amount(self, amount) -> str:
        """Decide the simulated outcome from the paise part of the amount."""
        if self.forced_outcome:
            return self.forced_outcome
        paise = to_paise(amount) % 100
        if paise == 1:
            return OUTCOME_FAILED
        if paise == 2:
            return OUTCOME_PENDING
        return OUTCOME_SUCCESS

    # ── operations ───────────────────────────────────────────────────────────
    def create_order(self, order) -> dict:
        """Razorpay `order.create` response shape, field for field."""
        amount = to_paise(order.total_amount)
        return {
            "id": _rzp_id("order"),
            "entity": "order",
            "amount": amount,
            "amount_paid": 0,
            "amount_due": amount,
            "currency": order.currency,
            "receipt": str(order.id)[:40],
            "offer_id": None,
            "status": "created",
            "attempts": 0,
            "notes": {"order_id": str(order.id), "user": order.user.email},
            "created_at": int(time.time()),
        }

    # -- the piece a real gateway does inside its hosted checkout -------------
    def new_payment_id(self) -> str:
        return _rzp_id("pay")

    def sign_checkout(self, order_id: str, payment_id: str) -> str:
        """Produce the signature Razorpay's checkout would hand the browser.

        Same message, same algorithm, different secret.  `verify_signature`
        cannot tell the difference — which is the whole point.
        """
        return hmac_sha256(self.key_secret, f"{order_id}|{payment_id}")

    def sign_webhook(self, raw_body: bytes) -> str:
        """Signature a Razorpay webhook delivery would carry (for tests/demo)."""
        return hmac_sha256(self.webhook_secret, raw_body or b"")

    def verify_signature(self, payload: dict) -> bool:
        import hmac as _hmac

        order_id = payload.get("order_id") or ""
        payment_id = payload.get("payment_id") or ""
        signature = payload.get("signature") or ""
        if not (order_id and payment_id and signature):
            return False
        expected = hmac_sha256(self.key_secret, f"{order_id}|{payment_id}")
        return _hmac.compare_digest(expected, signature)

    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        import hmac as _hmac

        if not signature:
            return False
        expected = hmac_sha256(self.webhook_secret, raw_body or b"")
        return _hmac.compare_digest(expected, signature)

    def fetch_payment(self, payment_id: str) -> dict:
        """Synthesize a Razorpay payment entity for a mock payment id."""
        from apps.payments.models import Payment, PaymentStatus

        row = Payment.objects.filter(gateway_payment_id=payment_id).first()
        if row is None:
            raise GatewayError(f"Mock gateway has no payment {payment_id}.")
        status_map = {
            PaymentStatus.SUCCESS: "captured",
            PaymentStatus.FAILED: "failed",
            PaymentStatus.REFUNDED: "refunded",
            PaymentStatus.PARTIALLY_REFUNDED: "captured",
        }
        amount = to_paise(row.amount)
        captured = row.status == PaymentStatus.SUCCESS
        return {
            "id": payment_id,
            "entity": "payment",
            "amount": amount,
            "currency": row.currency,
            "status": status_map.get(row.status, "created"),
            "order_id": row.gateway_order_id,
            "invoice_id": None,
            "international": False,
            "method": "upi",
            "amount_refunded": 0,
            "refund_status": None,
            "captured": captured,
            "description": f"Showzy order {str(row.order_id)[:8]}",
            "email": row.order.user.email,
            "contact": row.order.user.phone or "",
            "notes": {"order_id": str(row.order_id)},
            "fee": int(amount * 0.02) if captured else 0,
            "tax": 0,
            "error_code": None if captured else "BAD_REQUEST_ERROR",
            "error_description": None if captured else row.failure_reason or None,
            "created_at": int(row.initiated_at.timestamp()),
        }

    def refund(self, payment, amount: Decimal, notes: dict | None = None) -> dict:
        if not payment.gateway_payment_id:
            raise GatewayError("Payment has no gateway payment id; cannot refund.")
        refund_paise = to_paise(amount)
        if refund_paise <= 0:
            raise GatewayError("Refund amount must be greater than zero.")
        if refund_paise > to_paise(payment.amount):
            # Razorpay rejects over-refunds; so do we.
            raise GatewayError(
                "The refund amount is greater than the amount captured for this payment."
            )
        return {
            "id": _rzp_id("rfnd"),
            "entity": "refund",
            "amount": refund_paise,
            "currency": payment.currency,
            "payment_id": payment.gateway_payment_id,
            "notes": notes or {},
            "receipt": None,
            "acquirer_data": {"arn": None},
            "created_at": int(time.time()),
            "batch_id": None,
            "status": "processed",
            "speed_processed": "normal",
            "speed_requested": "normal",
        }
