"""Tests for the pluggable payment gateway layer.

These cover money logic: order creation, signature verification (accepted and
tampered), refunds actually reaching the gateway, webhook idempotency, and the
free-ticket path.  They run entirely against the mock gateway, which uses the
same signature algorithm and the same code paths as live Razorpay.
"""

import hashlib
import hmac
import json
import re
import shutil
import tempfile
from datetime import timedelta
from decimal import Decimal
from unittest import mock as umock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.models import City
from apps.events.models import Event
from apps.tickets.models import Order, OrderItem, Ticket, TicketTier
from apps.venues.models import Venue

from .gateways import (
    GatewayConfigurationError,
    GatewayError,
    MockGateway,
    RazorpayGateway,
    get_gateway,
    reset_gateway_cache,
)
from .models import Gateway, Payment, PaymentStatus, PaymentWebhook, Refund

MEDIA_ROOT = tempfile.mkdtemp(prefix="naada-payments-tests-")

MOCK_SETTINGS = dict(
    PAYMENT_GATEWAY="mock",
    MOCK_PAYMENT_KEY_ID="rzp_test_mocknaada001",
    MOCK_PAYMENT_KEY_SECRET="naada_mock_secret_dev_only",
    MOCK_PAYMENT_OUTCOME="",
    MEDIA_ROOT=MEDIA_ROOT,
)


@override_settings(**MOCK_SETTINGS)
class PaymentsTestCase(TestCase):
    """Shared fixtures: one user, one event, one ₹500 tier."""

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        reset_gateway_cache()
        User = get_user_model()
        self.user = User.objects.create_user(
            email="fan@naada.test", full_name="Test Fan", phone="+919000000001")
        self.other = User.objects.create_user(
            email="other@naada.test", full_name="Other Fan", phone="+919000000002")
        self.city = City.objects.create(name="Bengaluru", slug="bengaluru")
        self.venue = Venue.objects.create(
            owner=self.user, name="Test Hall", slug="test-hall",
            address_line1="1 MG Road", city=self.city, capacity=200)
        self.event = Event.objects.create(
            organizer=self.user, venue=self.venue, title="Raag Night",
            start_datetime=timezone.now() + timedelta(days=7),
            end_datetime=timezone.now() + timedelta(days=7, hours=3))
        self.tier = TicketTier.objects.create(
            event=self.event, name="General", price=Decimal("500.00"),
            total_quantity=100, reserved_quantity=2)
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    # ── helpers ──────────────────────────────────────────────────────────────
    def make_order(self, total=Decimal("500.00"), qty=2, tier=None):
        tier = tier or self.tier
        order = Order.objects.create(
            user=self.user, event=self.event, total_amount=total,
            subtotal=total, status=Order.Status.INITIATED)
        OrderItem.objects.create(
            order=order, tier=tier, quantity=qty,
            unit_price=tier.price, total_price=tier.price * qty)
        return order

    def initiate(self, order):
        resp = self.client.post(reverse("payments-initiate"),
                                {"order_id": str(order.id), "gateway": "razorpay"},
                                format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        return resp.data

    def mock_checkout(self, init, outcome=None):
        body = {"order_id": init["order_id"],
                "gateway_order_id": init["gateway_order_id"]}
        if outcome:
            body["outcome"] = outcome
        return self.client.post(reverse("payments-mock-checkout"), body, format="json")

    def verify(self, init, checkout):
        return self.client.post(reverse("payments-verify"), {
            "order_id": init["order_id"],
            "gateway_order_id": checkout["gateway_order_id"],
            "gateway_payment_id": checkout["gateway_payment_id"],
            "gateway_signature": checkout["gateway_signature"],
        }, format="json")

    def pay_successfully(self, order):
        init = self.initiate(order)
        checkout = self.mock_checkout(init).data
        resp = self.verify(init, checkout)
        self.assertEqual(resp.status_code, 200, resp.data)
        return init, checkout

    def signed_webhook_post(self, payload: dict, event_id="evt_test_0001",
                            signature=None):
        raw = json.dumps(payload)
        gateway = get_gateway()
        sig = signature if signature is not None else gateway.sign_webhook(raw.encode())
        return self.client.post(
            reverse("payments-webhook"), data=raw,
            content_type="application/json",
            HTTP_X_RAZORPAY_SIGNATURE=sig,
            HTTP_X_RAZORPAY_EVENT_ID=event_id,
        )


class GatewaySelectorTests(PaymentsTestCase):

    def test_mock_is_the_default(self):
        gateway = get_gateway()
        self.assertEqual(gateway.name, "mock")
        self.assertTrue(gateway.is_mock)

    def test_live_without_credentials_raises_instead_of_downgrading(self):
        with override_settings(PAYMENT_GATEWAY="razorpay",
                               RAZORPAY_KEY_ID="rzp_test_placeholder",
                               RAZORPAY_KEY_SECRET="placeholder_secret"):
            with self.assertRaises(GatewayConfigurationError):
                get_gateway()

    def test_live_with_real_credentials_selects_razorpay(self):
        with override_settings(PAYMENT_GATEWAY="razorpay",
                               RAZORPAY_KEY_ID="rzp_live_abc123456789",
                               RAZORPAY_KEY_SECRET="realsecret0987654321"):
            gateway = get_gateway()
            self.assertIsInstance(gateway, RazorpayGateway)
            self.assertFalse(gateway.is_mock)
            self.assertEqual(gateway.public_key, "rzp_live_abc123456789")

    def test_unknown_gateway_name_raises(self):
        with override_settings(PAYMENT_GATEWAY="stripe"):
            with self.assertRaises(GatewayConfigurationError):
                get_gateway()

    def test_misconfigured_gateway_returns_503_not_a_mock_payment(self):
        order = self.make_order()
        with override_settings(PAYMENT_GATEWAY="razorpay",
                               RAZORPAY_KEY_ID="rzp_test_placeholder",
                               RAZORPAY_KEY_SECRET="placeholder_secret"):
            resp = self.client.post(reverse("payments-initiate"),
                                    {"order_id": str(order.id), "gateway": "razorpay"},
                                    format="json")
        self.assertEqual(resp.status_code, 503)
        self.assertFalse(Payment.objects.filter(order=order).exists())


class SignatureAlgorithmTests(PaymentsTestCase):
    """The signature code goes live unchanged, so pin it to Razorpay's spec."""

    def test_razorpay_signature_matches_documented_algorithm(self):
        gateway = RazorpayGateway("rzp_test_key", "supersecret")
        expected = hmac.new(b"supersecret", b"order_abc|pay_xyz",
                            hashlib.sha256).hexdigest()
        self.assertTrue(gateway.verify_signature(
            {"order_id": "order_abc", "payment_id": "pay_xyz", "signature": expected}))
        self.assertFalse(gateway.verify_signature(
            {"order_id": "order_abc", "payment_id": "pay_xyz", "signature": "0" * 64}))

    def test_mock_uses_the_same_algorithm_as_razorpay(self):
        gateway = MockGateway("rzp_test_mock", "mocksecret")
        sig = gateway.sign_checkout("order_abc", "pay_xyz")
        self.assertEqual(sig, hmac.new(b"mocksecret", b"order_abc|pay_xyz",
                                       hashlib.sha256).hexdigest())

    def test_incomplete_payload_is_rejected(self):
        gateway = get_gateway()
        self.assertFalse(gateway.verify_signature(
            {"order_id": "order_abc", "payment_id": "", "signature": "x"}))


class MockOrderCreationTests(PaymentsTestCase):

    def test_initiate_returns_razorpay_shaped_order_and_stable_contract(self):
        order = self.make_order()
        data = self.initiate(order)

        for key in ("payment_id", "order_id", "gateway", "is_mock", "key",
                    "gateway_order_id", "amount", "currency", "status"):
            self.assertIn(key, data)
        self.assertEqual(data["gateway"], "mock")
        self.assertTrue(data["is_mock"])
        self.assertEqual(data["amount"], 50000)          # paise, like Razorpay
        self.assertEqual(data["currency"], "INR")
        self.assertRegex(data["gateway_order_id"], r"^order_[A-Za-z0-9]{14}$")
        self.assertIsNotNone(data["mock_checkout_url"])

        payment = Payment.objects.get(pk=data["payment_id"])
        self.assertEqual(payment.status, PaymentStatus.INITIATED)
        self.assertEqual(payment.gateway, Gateway.RAZORPAY)
        self.assertTrue(payment.metadata["is_mock"])
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PAYMENT_PENDING)

    def test_mock_order_entity_has_razorpay_fields(self):
        order = self.make_order()
        entity = get_gateway().create_order(order)
        for key in ("id", "entity", "amount", "amount_paid", "amount_due",
                    "currency", "receipt", "status", "attempts", "notes",
                    "created_at"):
            self.assertIn(key, entity)
        self.assertEqual(entity["entity"], "order")
        self.assertEqual(entity["status"], "created")

    def test_cannot_pay_for_someone_elses_order(self):
        order = self.make_order()
        self.client.force_authenticate(user=self.other)
        resp = self.client.post(reverse("payments-initiate"),
                                {"order_id": str(order.id), "gateway": "razorpay"},
                                format="json")
        self.assertEqual(resp.status_code, 404)


class SignatureVerificationFlowTests(PaymentsTestCase):

    def test_correct_signature_confirms_order_and_issues_tickets(self):
        order = self.make_order(qty=2)
        init, checkout = self.pay_successfully(order)

        self.assertRegex(checkout["gateway_payment_id"], r"^pay_[A-Za-z0-9]{14}$")
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertIsNotNone(order.confirmed_at)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)
        self.assertTrue(all(t.qr_image for t in Ticket.objects.filter(order=order)))

        self.tier.refresh_from_db()
        self.assertEqual(self.tier.sold_quantity, 2)
        self.assertEqual(self.tier.reserved_quantity, 0)

        payment = Payment.objects.get(pk=init["payment_id"])
        self.assertEqual(payment.status, PaymentStatus.SUCCESS)
        self.assertEqual(payment.gateway_payment_id, checkout["gateway_payment_id"])

    def test_tampered_signature_is_rejected(self):
        order = self.make_order()
        init = self.initiate(order)
        checkout = dict(self.mock_checkout(init).data)
        # flip one hex character — a real HMAC check must catch this
        sig = checkout["gateway_signature"]
        checkout["gateway_signature"] = ("f" if sig[0] != "f" else "0") + sig[1:]

        resp = self.verify(init, checkout)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("signature", resp.data["detail"].lower())

        order.refresh_from_db()
        self.assertNotEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 0)
        payment = Payment.objects.get(pk=init["payment_id"])
        self.assertEqual(payment.status, PaymentStatus.FAILED)
        self.assertEqual(payment.failure_reason, "Signature mismatch")

    def test_signature_from_a_different_order_is_rejected(self):
        order_a = self.make_order()
        order_b = self.make_order()
        init_a = self.initiate(order_a)
        init_b = self.initiate(order_b)
        checkout_b = self.mock_checkout(init_b).data
        # order A's id with order B's signature
        resp = self.client.post(reverse("payments-verify"), {
            "order_id": init_a["order_id"],
            "gateway_order_id": init_a["gateway_order_id"],
            "gateway_payment_id": checkout_b["gateway_payment_id"],
            "gateway_signature": checkout_b["gateway_signature"],
        }, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_verify_twice_issues_one_set_of_tickets(self):
        order = self.make_order(qty=2)
        init, checkout = self.pay_successfully(order)
        resp = self.verify(init, checkout)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data.get("already_verified"))
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)
        self.tier.refresh_from_db()
        self.assertEqual(self.tier.sold_quantity, 2)


class DeterministicOutcomeTests(PaymentsTestCase):
    """Documented demo hooks: paise ..01 fails, ..02 pends, anything else succeeds."""

    def test_amount_ending_in_01_paise_fails(self):
        order = self.make_order(total=Decimal("500.01"))
        init = self.initiate(order)
        resp = self.mock_checkout(init)
        self.assertEqual(resp.data["status"], "failed")
        self.assertEqual(resp.data["error"]["code"], "BAD_REQUEST_ERROR")
        self.assertEqual(resp.data["error"]["reason"], "payment_failed")
        self.assertEqual(Payment.objects.get(pk=init["payment_id"]).status,
                         PaymentStatus.FAILED)
        order.refresh_from_db()
        self.assertNotEqual(order.status, Order.Status.CONFIRMED)

    def test_amount_ending_in_02_paise_pends(self):
        order = self.make_order(total=Decimal("500.02"))
        init = self.initiate(order)
        resp = self.mock_checkout(init)
        self.assertEqual(resp.data["status"], "pending")
        self.assertEqual(Payment.objects.get(pk=init["payment_id"]).status,
                         PaymentStatus.PROCESSING)

    def test_explicit_outcome_override(self):
        order = self.make_order()
        init = self.initiate(order)
        self.assertEqual(self.mock_checkout(init, outcome="failed").data["status"],
                         "failed")

    def test_invalid_outcome_rejected(self):
        order = self.make_order()
        init = self.initiate(order)
        self.assertEqual(self.mock_checkout(init, outcome="whatever").status_code, 400)

    def test_global_forced_outcome_setting(self):
        with override_settings(MOCK_PAYMENT_OUTCOME="failed"):
            reset_gateway_cache()
            order = self.make_order()
            init = self.initiate(order)
            self.assertEqual(self.mock_checkout(init).data["status"], "failed")

    def test_mock_checkout_is_disabled_when_live(self):
        order = self.make_order()
        init = self.initiate(order)
        with override_settings(PAYMENT_GATEWAY="razorpay",
                               RAZORPAY_KEY_ID="rzp_live_abc123456789",
                               RAZORPAY_KEY_SECRET="realsecret0987654321"):
            resp = self.mock_checkout(init)
        self.assertEqual(resp.status_code, 404)


class RefundTests(PaymentsTestCase):

    def refund(self, payment_id, reason="user_request", ticket_id=None):
        body = {"payment_id": str(payment_id), "reason": reason}
        if ticket_id:
            body["ticket_id"] = str(ticket_id)
        return self.client.post(reverse("payments-refund"), body, format="json")

    def test_refund_calls_the_gateway_and_persists_its_id(self):
        order = self.make_order()
        init, _ = self.pay_successfully(order)
        resp = self.refund(init["payment_id"])

        self.assertEqual(resp.status_code, 201, resp.data)
        refund = Refund.objects.get(pk=resp.data["id"])
        self.assertRegex(refund.gateway_refund_id, r"^rfnd_[A-Za-z0-9]{14}$")
        self.assertEqual(refund.status, Refund.Status.SUCCESS)
        self.assertIsNotNone(refund.processed_at)
        self.assertEqual(refund.gateway_response["entity"], "refund")
        self.assertEqual(refund.gateway_response["amount"], 50000)

        payment = Payment.objects.get(pk=init["payment_id"])
        self.assertEqual(payment.status, PaymentStatus.REFUNDED)

    def test_partial_refund_of_one_ticket(self):
        order = self.make_order(qty=2, total=Decimal("1000.00"))
        init, _ = self.pay_successfully(order)
        ticket = Ticket.objects.filter(order=order).first()

        resp = self.refund(init["payment_id"], ticket_id=ticket.id)
        self.assertEqual(resp.status_code, 201, resp.data)
        refund = Refund.objects.get(pk=resp.data["id"])
        self.assertEqual(refund.amount, Decimal("500.00"))
        payment = Payment.objects.get(pk=init["payment_id"])
        self.assertEqual(payment.status, PaymentStatus.PARTIALLY_REFUNDED)

    def test_over_refund_is_blocked(self):
        order = self.make_order()
        init, _ = self.pay_successfully(order)
        self.assertEqual(self.refund(init["payment_id"]).status_code, 201)
        second = self.refund(init["payment_id"])
        self.assertEqual(second.status_code, 400)

    def test_gateway_failure_leaves_a_failed_row_not_a_dangling_pending_one(self):
        order = self.make_order()
        init, _ = self.pay_successfully(order)

        with umock.patch.object(MockGateway, "refund",
                                side_effect=GatewayError("gateway down")):
            resp = self.refund(init["payment_id"])

        self.assertEqual(resp.status_code, 502)
        refund = Refund.objects.get(payment_id=init["payment_id"])
        self.assertEqual(refund.status, Refund.Status.FAILED)
        self.assertEqual(refund.gateway_refund_id, "")
        self.assertIn("gateway down", refund.failure_reason)
        # the payment must NOT look refunded
        self.assertEqual(Payment.objects.get(pk=init["payment_id"]).status,
                         PaymentStatus.SUCCESS)

    def test_unpaid_payment_cannot_be_refunded(self):
        order = self.make_order()
        init = self.initiate(order)
        self.assertEqual(self.refund(init["payment_id"]).status_code, 400)

    def test_mock_gateway_rejects_over_refund_like_razorpay(self):
        order = self.make_order()
        init, _ = self.pay_successfully(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        with self.assertRaises(GatewayError):
            get_gateway().refund(payment, Decimal("999999.00"))


class WebhookTests(PaymentsTestCase):

    def captured_payload(self, payment):
        return {
            "entity": "event",
            "event": "payment.captured",
            "contains": ["payment"],
            "payload": {"payment": {"entity": {
                "id": payment.gateway_payment_id or "pay_hook0000000001",
                "entity": "payment",
                "amount": int(payment.amount * 100),
                "currency": payment.currency,
                "status": "captured",
                "order_id": payment.gateway_order_id,
                "captured": True,
            }}},
            "created_at": int(timezone.now().timestamp()),
        }

    def test_invalid_signature_is_rejected_and_stores_nothing(self):
        order = self.make_order()
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        resp = self.signed_webhook_post(self.captured_payload(payment),
                                        signature="deadbeef")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(PaymentWebhook.objects.count(), 0)
        order.refresh_from_db()
        self.assertNotEqual(order.status, Order.Status.CONFIRMED)

    def test_missing_signature_is_rejected(self):
        order = self.make_order()
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        resp = self.signed_webhook_post(self.captured_payload(payment), signature="")
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(PaymentWebhook.objects.count(), 0)

    def test_captured_webhook_confirms_the_order(self):
        order = self.make_order(qty=2)
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        resp = self.signed_webhook_post(self.captured_payload(payment))

        self.assertEqual(resp.status_code, 200, resp.data)
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentStatus.SUCCESS)
        self.assertEqual(payment.gateway_payment_id, "pay_hook0000000001")
        webhook = PaymentWebhook.objects.get()
        self.assertTrue(webhook.is_processed)
        self.assertEqual(webhook.processing_error, "")

    def test_same_event_delivered_twice_confirms_once(self):
        order = self.make_order(qty=2)
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        payload = self.captured_payload(payment)

        first = self.signed_webhook_post(payload, event_id="evt_dupe_1")
        second = self.signed_webhook_post(payload, event_id="evt_dupe_1")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data.get("duplicate"))
        self.assertEqual(PaymentWebhook.objects.count(), 1)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)
        self.tier.refresh_from_db()
        self.assertEqual(self.tier.sold_quantity, 2)

    def test_retry_without_event_id_header_is_still_idempotent(self):
        order = self.make_order(qty=2)
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        raw = json.dumps(self.captured_payload(payment))
        sig = get_gateway().sign_webhook(raw.encode())

        def deliver():
            return self.client.post(reverse("payments-webhook"), data=raw,
                                    content_type="application/json",
                                    HTTP_X_RAZORPAY_SIGNATURE=sig)

        deliver()
        second = deliver()
        self.assertTrue(second.data.get("duplicate"))
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)

    def test_webhook_after_browser_verify_does_not_double_issue(self):
        order = self.make_order(qty=2)
        init, checkout = self.pay_successfully(order)
        payment = Payment.objects.get(pk=init["payment_id"])

        resp = self.signed_webhook_post(self.captured_payload(payment),
                                        event_id="evt_late_1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 2)
        self.tier.refresh_from_db()
        self.assertEqual(self.tier.sold_quantity, 2)

    def test_payment_failed_webhook_marks_payment_failed(self):
        order = self.make_order()
        init = self.initiate(order)
        payment = Payment.objects.get(pk=init["payment_id"])
        payload = self.captured_payload(payment)
        payload["event"] = "payment.failed"
        payload["payload"]["payment"]["entity"]["status"] = "failed"
        payload["payload"]["payment"]["entity"]["error_description"] = "Card declined"

        resp = self.signed_webhook_post(payload, event_id="evt_fail_1")
        self.assertEqual(resp.status_code, 200)
        payment.refresh_from_db()
        self.assertEqual(payment.status, PaymentStatus.FAILED)
        self.assertEqual(payment.failure_reason, "Card declined")
        order.refresh_from_db()
        self.assertNotEqual(order.status, Order.Status.CONFIRMED)


class FreeAndOfflinePathTests(PaymentsTestCase):

    def test_zero_amount_order_is_confirmed_without_a_gateway(self):
        free_tier = TicketTier.objects.create(
            event=self.event, name="Free", price=Decimal("0.00"),
            total_quantity=50, reserved_quantity=1)
        order = self.make_order(total=Decimal("0.00"), qty=1, tier=free_tier)

        resp = self.client.post(reverse("payments-initiate"),
                                {"order_id": str(order.id), "gateway": "razorpay"},
                                format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(resp.data["status"], "success")
        self.assertEqual(resp.data["gateway"], "comp")
        self.assertFalse(resp.data["is_mock"])

        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.CONFIRMED)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 1)
        payment = Payment.objects.get(order=order)
        self.assertEqual(payment.gateway, Gateway.COMPLIMENTARY)
        self.assertEqual(payment.status, PaymentStatus.SUCCESS)
        free_tier.refresh_from_db()
        self.assertEqual(free_tier.sold_quantity, 1)
        self.assertEqual(free_tier.reserved_quantity, 0)

    def test_complimentary_gateway_choice_by_organizer_skips_payment(self):
        # self.user is both the buyer here and self.event's organizer — comping
        # your own event's order is the legitimate use of this gateway choice.
        order = self.make_order()
        resp = self.client.post(reverse("payments-initiate"),
                                {"order_id": str(order.id), "gateway": "comp"},
                                format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Payment.objects.get(order=order).gateway,
                         Gateway.COMPLIMENTARY)

    def test_complimentary_gateway_choice_blocked_for_ordinary_buyer(self):
        # A buyer with no relationship to the event must not be able to
        # self-select "comp" on their own paid order and get a free ticket.
        order = Order.objects.create(
            user=self.other, event=self.event, total_amount=Decimal("500.00"),
            subtotal=Decimal("500.00"), status=Order.Status.INITIATED)
        OrderItem.objects.create(
            order=order, tier=self.tier, quantity=1,
            unit_price=self.tier.price, total_price=self.tier.price)
        other_client = APIClient()
        other_client.force_authenticate(user=self.other)
        resp = other_client.post(reverse("payments-initiate"),
                                 {"order_id": str(order.id), "gateway": "comp"},
                                 format="json")
        self.assertEqual(resp.status_code, 403)
        self.assertFalse(Payment.objects.filter(order=order).exists())
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.INITIATED)

    def test_cash_path_leaves_order_pending(self):
        order = self.make_order()
        resp = self.client.post(reverse("payments-initiate"),
                                {"order_id": str(order.id), "gateway": "cash"},
                                format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "cash_pending")
        self.assertEqual(resp.data["gateway"], "cash")
        order.refresh_from_db()
        self.assertEqual(order.status, Order.Status.PAYMENT_PENDING)
        self.assertEqual(Ticket.objects.filter(order=order).count(), 0)

    def test_cash_refund_is_settled_offline_without_the_gateway(self):
        order = self.make_order()
        payment = Payment.objects.create(
            order=order, gateway=Gateway.CASH, amount=order.total_amount,
            status=PaymentStatus.SUCCESS, completed_at=timezone.now())
        with umock.patch.object(MockGateway, "refund",
                                side_effect=AssertionError("must not call gateway")):
            resp = self.client.post(reverse("payments-refund"),
                                    {"payment_id": str(payment.id),
                                     "reason": "user_request"}, format="json")
        self.assertEqual(resp.status_code, 201, resp.data)
        refund = Refund.objects.get(pk=resp.data["id"])
        self.assertEqual(refund.status, Refund.Status.SUCCESS)
        self.assertTrue(refund.gateway_response["offline"])


class MockFetchPaymentTests(PaymentsTestCase):

    def test_fetch_payment_returns_a_razorpay_payment_entity(self):
        order = self.make_order()
        init, checkout = self.pay_successfully(order)
        entity = get_gateway().fetch_payment(checkout["gateway_payment_id"])

        for key in ("id", "entity", "amount", "currency", "status", "order_id",
                    "method", "captured", "created_at"):
            self.assertIn(key, entity)
        self.assertEqual(entity["entity"], "payment")
        self.assertEqual(entity["status"], "captured")
        self.assertTrue(entity["captured"])
        self.assertEqual(entity["amount"], 50000)

    def test_fetch_unknown_payment_raises(self):
        with self.assertRaises(GatewayError):
            get_gateway().fetch_payment("pay_doesnotexist1")


class PayoutSummaryTests(PaymentsTestCase):
    def url(self):
        return reverse("event-payout-summary", args=[self.event.id])

    def test_owed_is_collected_less_fee_and_refunds(self):
        order = self.make_order(total=Decimal("1038.00"), qty=2)
        order.platform_fee = Decimal("38.00")
        order.subtotal = Decimal("1000.00")
        order.save()
        init, _ = self.pay_successfully(order)
        s = self.client.get(self.url()).data
        self.assertEqual(s["collected"], "1038.00")
        self.assertEqual(s["naada_fee"], "38.00")
        self.assertEqual(s["owed_to_organiser"], "1000.00")
        self.assertEqual(s["balance"], "1000.00")

    def test_recorded_payouts_reduce_the_balance(self):
        from django.utils import timezone
        from .models import OrganizerPayout
        self.pay_successfully(self.make_order(total=Decimal("1000.00")))
        OrganizerPayout.objects.create(event=self.event, amount=Decimal("400.00"),
                                       reference="UTR123", paid_at=timezone.now())
        s = self.client.get(self.url()).data
        self.assertEqual(s["paid_out"], "400.00")
        self.assertEqual(s["balance"], "600.00")

    def test_fully_refunded_order_owes_nothing_and_keeps_no_fee(self):
        order = self.make_order(total=Decimal("519.00"), qty=1)
        order.platform_fee = Decimal("19.00")
        order.save()
        init, _ = self.pay_successfully(order)
        self.client.post(reverse("payments-refund"),
                         {"payment_id": init["payment_id"], "reason": "user_request"}, format="json")
        s = self.client.get(self.url()).data
        self.assertEqual(s["naada_fee"], "0.00")
        self.assertEqual(s["owed_to_organiser"], "0.00")

    def test_only_the_organiser_can_see_it(self):
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.get(self.url()).status_code, 403)
