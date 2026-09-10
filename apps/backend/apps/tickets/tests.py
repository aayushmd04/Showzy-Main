"""Tests for ticket pricing.

These cover the arithmetic that decides what a buyer is charged. Everything
here was silently wrong at some point today — the booking fee was hardcoded to
zero while the UI displayed one, and GST had no mechanism at all — so the point
is to make the next silent change loud.
"""

from decimal import Decimal

from django.test import SimpleTestCase, override_settings

from apps.tickets.tax import compute_gst


class GstDefaultsTests(SimpleTestCase):
    """Shipped defaults must charge nothing. Anything else is a surprise bill."""

    def test_no_rates_configured_means_no_tax(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("38"), ticket_count=2
        )
        self.assertEqual(gst["total"], Decimal("0"))
        self.assertFalse(gst["is_configured"])

    def test_free_order_is_never_taxed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("0"), booking_fee=Decimal("0"), ticket_count=3
        )
        self.assertEqual(gst["total"], Decimal("0"))


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=0, GST_TICKET_EXEMPT_BELOW=0)
class GstOnFeeOnlyTests(SimpleTestCase):
    """The common starting point: tax our own service, leave admission alone."""

    def test_fee_is_taxed_and_tickets_are_not(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("100"), ticket_count=2
        )
        self.assertEqual(gst["on_fee"], Decimal("18.00"))
        self.assertEqual(gst["on_tickets"], Decimal("0"))
        self.assertEqual(gst["total"], Decimal("18.00"))

    def test_split_halves_add_back_to_the_total_exactly(self):
        # An odd total is where naive rounding loses a paisa.
        gst = compute_gst(
            ticket_subtotal=Decimal("0"), booking_fee=Decimal("19"), ticket_count=1
        )
        self.assertEqual(gst["cgst"] + gst["sgst"], gst["total"])


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=18, GST_TICKET_EXEMPT_BELOW=500)
class GstExemptionThresholdTests(SimpleTestCase):
    """Admission is commonly exempt below a per-ticket price, not an order total."""

    def test_cheap_tickets_are_exempt_even_when_the_order_is_large(self):
        # Ten tickets at Rs 200 is a Rs 2,000 order made of exempt tickets.
        gst = compute_gst(
            ticket_subtotal=Decimal("2000"), booking_fee=Decimal("0"), ticket_count=10
        )
        self.assertEqual(gst["on_tickets"], Decimal("0"))

    def test_tickets_at_or_above_the_threshold_are_taxed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("0"), ticket_count=2
        )
        self.assertEqual(gst["on_tickets"], Decimal("180.00"))

    def test_the_threshold_reads_per_ticket_not_per_order(self):
        one_expensive = compute_gst(
            ticket_subtotal=Decimal("600"), booking_fee=Decimal("0"), ticket_count=1
        )
        three_cheap = compute_gst(
            ticket_subtotal=Decimal("600"), booking_fee=Decimal("0"), ticket_count=3
        )
        self.assertGreater(one_expensive["on_tickets"], Decimal("0"))
        self.assertEqual(three_cheap["on_tickets"], Decimal("0"))


@override_settings(GST_RATE_FEE=18, GST_RATE_TICKET=18, GST_TICKET_EXEMPT_BELOW=0)
class GstOnEverythingTests(SimpleTestCase):
    def test_both_components_are_taxed_and_summed(self):
        gst = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("100"), ticket_count=2
        )
        self.assertEqual(gst["on_tickets"], Decimal("180.00"))
        self.assertEqual(gst["on_fee"], Decimal("18.00"))
        self.assertEqual(gst["total"], Decimal("198.00"))
        self.assertTrue(gst["is_configured"])

    def test_discount_is_taxed_on_what_is_actually_paid(self):
        """The caller passes the post-discount subtotal, so a promo reduces tax."""
        full = compute_gst(
            ticket_subtotal=Decimal("1000"), booking_fee=Decimal("0"), ticket_count=1
        )
        discounted = compute_gst(
            ticket_subtotal=Decimal("800"), booking_fee=Decimal("0"), ticket_count=1
        )
        self.assertEqual(full["on_tickets"], Decimal("180.00"))
        self.assertEqual(discounted["on_tickets"], Decimal("144.00"))
