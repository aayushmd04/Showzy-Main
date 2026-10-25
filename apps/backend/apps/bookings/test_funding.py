"""Funding a booking's escrow must be real, for this booking, and in full.

`fund_order` used to skip signature checking whenever live Razorpay keys were
missing, let the artist (the person being paid) mark the order funded, and, with
keys present, accept ANY genuine Razorpay payment: a ₹10 ticket purchase could
"fund" a ₹1,00,000 booking. These tests pin all of that shut.
"""

from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.artists.models import Artist
from apps.payments.gateways import hmac_sha256, to_paise

from .models import BookingOrder, LedgerEntry, Organizer, Transfer
from .tests import make_booking_order

User = get_user_model()

LIVE = dict(
    PAYMENT_GATEWAY="razorpay",
    RAZORPAY_KEY_ID="rzp_test_realkey123",
    RAZORPAY_KEY_SECRET="a_real_looking_secret_key",
    RAZORPAY_WEBHOOK_SECRET="",
)
MOCK = dict(PAYMENT_GATEWAY="mock")


class FundingBase(TestCase):
    def setUp(self):
        self.host = User.objects.create_user(email="host@naada.test", full_name="Host")
        self.artist_user = User.objects.create_user(email="artist@naada.test", full_name="Artist")
        self.stranger = User.objects.create_user(email="nobody@naada.test", full_name="Nobody")
        self.organizer = Organizer.objects.create(name="Hall", slug="hall-funding")
        self.organizer.memberships.create(user=self.host, role="owner")
        self.artist = Artist.objects.create(user=self.artist_user, stage_name="Arjun")

        self.order = make_booking_order(self.organizer, self.artist, gross=Decimal("10000.00"))
        self.order.status = BookingOrder.Status.ACCEPTED
        self.order.save(update_fields=["status"])

        # No Celery broker in tests: don't try to schedule the 72h auto-release.
        patcher = mock.patch("apps.bookings.tasks.auto_release_booking.apply_async",
                             return_value=mock.Mock(id="task-1"))
        patcher.start()
        self.addCleanup(patcher.stop)

    def client_for(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def start(self, user=None):
        return self.client_for(user or self.host).post(
            reverse("booking-fund-start", args=[self.order.id]), {}, format="json")

    def fund(self, body, user=None):
        return self.client_for(user or self.host).post(
            reverse("booking-fund", args=[self.order.id]), body, format="json")

    @staticmethod
    def signed(order_id, payment_id, secret=LIVE["RAZORPAY_KEY_SECRET"]):
        return {
            "razorpay_order_id": order_id,
            "razorpay_payment_id": payment_id,
            "razorpay_signature": hmac_sha256(secret, f"{order_id}|{payment_id}"),
        }


@override_settings(**LIVE)
class LiveFundingTests(FundingBase):
    GW_ORDER = "order_BOOKINGxxxxxx"

    def open_payment(self):
        with mock.patch("apps.payments.gateways.razorpay_gateway.RazorpayGateway.create_escrow_order",
                        return_value={"id": self.GW_ORDER}):
            res = self.start()
        self.assertEqual(res.status_code, 200, res.data)
        self.order.refresh_from_db()
        return res

    def captured(self, **over):
        entity = {"id": "pay_REAL000000001", "order_id": self.GW_ORDER, "status": "captured",
                  "amount": to_paise(self.order.gross_amount), "currency": "INR"}
        entity.update(over)
        return mock.patch("apps.payments.gateways.razorpay_gateway.RazorpayGateway.fetch_payment",
                          return_value=entity)

    def test_starting_opens_an_order_for_the_full_gross_amount(self):
        res = self.open_payment()
        self.assertEqual(res.data["gateway_order_id"], self.GW_ORDER)
        self.assertEqual(res.data["amount"], to_paise(self.order.gross_amount))
        self.assertFalse(res.data["is_mock"])
        self.assertEqual(self.order.razorpay_order_id, self.GW_ORDER)

    def test_the_artist_cannot_fund_or_start_funding_their_own_booking(self):
        self.open_payment()
        self.assertEqual(self.start(self.artist_user).status_code, 403)
        with self.captured():
            res = self.fund(self.signed(self.GW_ORDER, "pay_REAL000000001"), user=self.artist_user)
        self.assertEqual(res.status_code, 403)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)

    def test_a_stranger_cannot_see_the_order_at_all(self):
        self.assertEqual(self.start(self.stranger).status_code, 404)
        self.assertEqual(self.fund(self.signed("o", "p"), user=self.stranger).status_code, 404)

    def test_funding_before_a_payment_was_started_is_refused(self):
        res = self.fund(self.signed("order_whatever", "pay_x"))
        self.assertEqual(res.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)

    def test_a_genuine_payment_for_something_else_cannot_fund_it(self):
        """The core exploit: a real ₹10 payment made against some OTHER gateway order."""
        self.open_payment()
        other_order = "order_TICKETpurchase"
        res = self.fund(self.signed(other_order, "pay_TEN_RUPEES"))
        self.assertEqual(res.status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)
        self.assertFalse(Transfer.objects.exists())

    def test_a_bad_signature_is_refused(self):
        self.open_payment()
        body = self.signed(self.GW_ORDER, "pay_REAL000000001", secret="wrong-secret")
        with self.captured():
            self.assertEqual(self.fund(body).status_code, 400)

    def test_a_payment_razorpay_does_not_report_captured_is_refused(self):
        self.open_payment()
        with self.captured(status="authorized"):
            res = self.fund(self.signed(self.GW_ORDER, "pay_REAL000000001"))
        self.assertEqual(res.status_code, 400)

    def test_a_short_payment_is_refused(self):
        self.open_payment()
        with self.captured(amount=1000):
            res = self.fund(self.signed(self.GW_ORDER, "pay_REAL000000001"))
        self.assertEqual(res.status_code, 400)

    def test_a_payment_that_belongs_to_a_different_gateway_order_is_refused(self):
        self.open_payment()
        with self.captured(order_id="order_SOMETHINGELSE"):
            res = self.fund(self.signed(self.GW_ORDER, "pay_REAL000000001"))
        self.assertEqual(res.status_code, 400)

    def test_a_payment_already_used_for_another_booking_is_refused(self):
        self.open_payment()
        other = make_booking_order(self.organizer, Artist.objects.create(
            user=self.stranger, stage_name="Someone"), gross=Decimal("500.00"))
        other.razorpay_payment_id = "pay_REAL000000001"
        other.save(update_fields=["razorpay_payment_id"])
        with self.captured():
            res = self.fund(self.signed(self.GW_ORDER, "pay_REAL000000001"))
        self.assertEqual(res.status_code, 409)

    def test_a_real_full_payment_for_this_booking_funds_it_exactly_once(self):
        self.open_payment()
        body = self.signed(self.GW_ORDER, "pay_REAL000000001")
        with self.captured():
            res = self.fund(body)
            again = self.fund(body)  # double-submit
        self.assertEqual(res.status_code, 200, res.data)
        self.assertEqual(again.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.FUNDED)
        self.assertEqual(self.order.razorpay_payment_id, "pay_REAL000000001")
        self.assertEqual(Transfer.objects.filter(booking_order=self.order).count(), 1)
        self.assertEqual(LedgerEntry.objects.filter(booking_order=self.order).count(), 4)

    def test_the_dev_bypass_values_do_not_work_on_a_live_gateway(self):
        self.open_payment()
        body = {"razorpay_order_id": "order_DEV_1", "razorpay_payment_id": "pay_DEV_1",
                "razorpay_signature": "dev_sig_bypass"}
        self.assertEqual(self.fund(body).status_code, 400)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)


@override_settings(PAYMENT_GATEWAY="razorpay", RAZORPAY_KEY_ID="", RAZORPAY_KEY_SECRET="")
class MissingKeysFailClosedTests(FundingBase):
    def test_a_live_deploy_missing_its_keys_does_not_skip_verification(self):
        """This used to be the bypass: 'no live credentials' meant 'dev mode, trust the browser'."""
        body = {"razorpay_order_id": "order_DEV_1", "razorpay_payment_id": "pay_DEV_1",
                "razorpay_signature": "dev_sig_bypass"}
        res = self.fund(body)
        self.assertEqual(res.status_code, 503)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)


@override_settings(**MOCK)
class MockGatewayDemoTests(FundingBase):
    """The explicit mock gateway keeps the demo flow working for the host only."""

    BODY = {"razorpay_order_id": "order_DEV_1", "razorpay_payment_id": "pay_DEV_1",
            "razorpay_signature": "dev_sig_bypass"}

    def test_the_host_can_fund_in_demo_mode(self):
        res = self.fund(self.BODY)
        self.assertEqual(res.status_code, 200, res.data)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.FUNDED)

    def test_the_artist_still_cannot_fund_in_demo_mode(self):
        self.assertEqual(self.fund(self.BODY, user=self.artist_user).status_code, 403)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status, BookingOrder.Status.ACCEPTED)
