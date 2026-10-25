"""Payment gateway interface.

Every gateway implementation (real Razorpay, or the mock used until the
merchant account is live) speaks exactly this vocabulary.  The views know
nothing else about payments — so swapping implementations is a config change,
never a code change.

The data shapes crossing this boundary are *Razorpay's* shapes.  That is
deliberate: Razorpay is the production gateway, so the mock conforms to it
rather than the other way round.
"""

from __future__ import annotations

import hashlib
import hmac
from abc import ABC, abstractmethod
from decimal import Decimal


class GatewayError(Exception):
    """A gateway call failed (network, auth, upstream rejection)."""


class GatewayConfigurationError(GatewayError):
    """The operator asked for a gateway that cannot be safely constructed.

    Raised, for example, when PAYMENT_GATEWAY=razorpay but no real API
    credentials are present.  We never silently downgrade to the mock: taking
    money is either real or it is not.
    """


def hmac_sha256(secret: str, message: str | bytes) -> str:
    """Razorpay's signature primitive: hex HMAC-SHA256 of message under secret."""
    if isinstance(message, str):
        message = message.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def to_paise(amount: Decimal | int | float) -> int:
    """Rupees (Decimal) -> integer paise, the only unit Razorpay accepts."""
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1")))


class PaymentGateway(ABC):
    """The minimal surface the payment views actually use."""

    #: machine name, e.g. "razorpay" / "mock"
    name: str = ""
    #: human label for logs and API responses
    display_name: str = ""
    #: True when no real money moves.  The API surfaces this to the frontend.
    is_mock: bool = False

    # ── identity ─────────────────────────────────────────────────────────────
    @property
    @abstractmethod
    def public_key(self) -> str:
        """Publishable key id handed to the browser checkout (never the secret)."""

    # ── operations ───────────────────────────────────────────────────────────
    @abstractmethod
    def create_order(self, order) -> dict:
        """Create a gateway order for a `tickets.Order`.

        Returns Razorpay's order entity dict:
        ``{id, entity, amount, amount_paid, amount_due, currency, receipt,
           status, notes, created_at, attempts}``
        """

    @abstractmethod
    def create_escrow_order(self, booking_order) -> dict:
        """Create a gateway order for a `bookings.BookingOrder`'s escrow funding.

        Same Razorpay order entity as `create_order`, for ``gross_amount``. The
        host pays against *this* order, and funding is only accepted for a payment
        made against it, so a payment made for anything else (a ₹10 ticket, say)
        can never be passed off as the escrow for a ₹1,00,000 booking.
        """

    @abstractmethod
    def verify_signature(self, payload: dict) -> bool:
        """Verify a checkout callback signature.

        ``payload`` carries ``order_id``, ``payment_id`` and ``signature``.
        The signed message is ``"{order_id}|{payment_id}"``, HMAC-SHA256 under
        the key secret — exactly as Razorpay documents it.
        """

    @abstractmethod
    def verify_webhook_signature(self, raw_body: bytes, signature: str) -> bool:
        """Verify a webhook delivery: HMAC-SHA256 over the *raw* request body."""

    @abstractmethod
    def fetch_payment(self, payment_id: str) -> dict:
        """Fetch a payment entity by its gateway id (``pay_...``)."""

    @abstractmethod
    def refund(self, payment, amount: Decimal, notes: dict | None = None) -> dict:
        """Refund (fully or partially) a captured payment.

        ``payment`` is a `payments.Payment` row; ``amount`` is in rupees.
        Returns Razorpay's refund entity dict (``{id, entity, amount, status, ...}``).
        Raises `GatewayError` if the gateway rejects the refund.
        """
