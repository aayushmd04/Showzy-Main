"""Pluggable payment gateways for Naada.

    from .gateways import get_gateway
    gateway = get_gateway()          # MockGateway today, RazorpayGateway when live

Switching to live Razorpay is one env var plus real credentials:

    PAYMENT_GATEWAY=razorpay
    RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
    RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx
    RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxx      # optional; defaults to the key secret
"""

from .base import (
    GatewayConfigurationError,
    GatewayError,
    PaymentGateway,
    hmac_sha256,
    to_paise,
)
from .mock import (
    OUTCOME_FAILED,
    OUTCOME_PENDING,
    OUTCOME_SUCCESS,
    OUTCOMES,
    MockGateway,
)
from .razorpay_gateway import RazorpayGateway
from .selector import (
    active_gateway_name,
    get_gateway,
    has_live_credentials,
    log_active_gateway,
    reset_gateway_cache,
)

__all__ = [
    "PaymentGateway", "GatewayError", "GatewayConfigurationError",
    "RazorpayGateway", "MockGateway",
    "get_gateway", "active_gateway_name", "has_live_credentials",
    "log_active_gateway", "reset_gateway_cache",
    "hmac_sha256", "to_paise",
    "OUTCOME_SUCCESS", "OUTCOME_FAILED", "OUTCOME_PENDING", "OUTCOMES",
]
