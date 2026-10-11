"""Consent log, data export and the account-deletion process."""

from datetime import timedelta

from django.core import mail
from django.urls import reverse
from django.utils import timezone

from apps.notifications.dispatch import record
from apps.notifications.models import Notification, NotificationType
from apps.tickets.models import GateAssignment, Ticket
from apps.tickets.test_gate import GateBase
from apps.users.models import ConsentRecord, OTPToken


class PrivacyBase(GateBase):
    def code_for(self, user):
        c = self.as_user(user)
        resp = c.post(reverse("auth-deletion-code"))
        self.assertEqual(resp.status_code, 200, resp.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn("deleting", mail.outbox[0].subject.lower())
        return resp.data["debug_otp"]

    def delete(self, user, **body):
        return self.as_user(user).delete(reverse("auth-me"), body, format="json")


class ConsentTests(PrivacyBase):
    def test_consent_is_an_append_only_log_with_a_current_position(self):
        c = self.as_user(self.buyer)
        url = reverse("auth-consents")
        c.post(url, {"kind": "terms_privacy", "version": "2026-10-11", "source": "signin"}, format="json")
        c.post(url, {"kind": "terms_privacy", "version": "2026-10-11"}, format="json")  # no duplicate
        c.post(url, {"kind": "marketing_email", "version": "2026-10-11", "granted": True}, format="json")
        resp = c.post(url, {"kind": "marketing_email", "version": "2026-10-11", "granted": False}, format="json")
        self.assertEqual(ConsentRecord.objects.filter(user=self.buyer).count(), 3)
        self.assertTrue(resp.data["terms_privacy"]["granted"])
        self.assertFalse(resp.data["marketing_email"]["granted"])  # withdrawn, history kept

    def test_rejects_unknown_kinds_and_requires_signin(self):
        c = self.as_user(self.buyer)
        r = c.post(reverse("auth-consents"), {"kind": "whatever", "version": "x"}, format="json")
        self.assertEqual(r.status_code, 400)
        from rest_framework.test import APIClient
        self.assertEqual(APIClient().post(reverse("auth-consents"), {}, format="json").status_code, 401)


class ExportTests(PrivacyBase):
    def test_export_covers_everything_we_hold(self):
        record(self.buyer, notification_type=NotificationType.WELCOME, title="Hi", body="b")
        GateAssignment.objects.create(event=self.event, invited_by=self.host, user=self.buyer,
                                      invitee_email=self.buyer.email, status="active")
        ConsentRecord.objects.create(user=self.buyer, kind="terms_privacy", version="2026-10-11")
        data = self.as_user(self.buyer).get(reverse("auth-me-export")).data
        for key in ("account", "tickets", "ticket_orders", "saved_events", "reviews", "notifications",
                    "gate_duty", "artist_profile", "venues", "devices", "email_preferences", "consents"):
            self.assertIn(key, data)
        self.assertEqual(data["tickets"][0]["holder_email"], "guest@x.test")
        self.assertEqual(len(data["gate_duty"]), 1)
        self.assertEqual(data["consents"][0]["kind"], "terms_privacy")


class DeletionTests(PrivacyBase):
    def test_check_lists_what_is_erased_and_kept(self):
        data = self.as_user(self.stranger).get(reverse("auth-deletion-check")).data
        self.assertTrue(data["can_delete"])
        self.assertTrue(data["erase"] and data["keep"])

    def test_a_host_with_a_live_upcoming_event_is_blocked(self):
        data = self.as_user(self.host).get(reverse("auth-deletion-check")).data
        self.assertFalse(data["can_delete"])
        self.assertEqual(data["blockers"][0]["code"], "upcoming_events")
        code = self.code_for(self.host)
        r = self.delete(self.host, code=code)
        self.assertEqual(r.status_code, 409)
        self.host.refresh_from_db()
        self.assertTrue(self.host.is_active)

    def test_upcoming_tickets_need_an_explicit_acknowledgement(self):
        check = self.as_user(self.buyer).get(reverse("auth-deletion-check")).data
        self.assertTrue(check["can_delete"])
        self.assertEqual(check["warnings"][0]["code"], "upcoming_tickets")
        code = self.code_for(self.buyer)
        r = self.delete(self.buyer, code=code)
        self.assertEqual(r.status_code, 409)
        self.assertTrue(r.data["needs_acknowledgement"])

    def test_a_wrong_or_missing_code_deletes_nothing(self):
        self.code_for(self.stranger)
        for body in ({}, {"code": "000000"}):
            self.assertEqual(self.delete(self.stranger, **body).status_code, 400)
        self.stranger.refresh_from_db()
        self.assertTrue(self.stranger.is_active)
        self.assertEqual(self.stranger.email, "nosy@naada.test")

    def test_a_code_for_another_purpose_cannot_delete(self):
        from rest_framework.test import APIClient
        c = APIClient()
        r = c.post(reverse("auth-request-otp"), {"email": "nosy@naada.test", "purpose": "delete_account"}, format="json")
        self.assertEqual(r.status_code, 400)  # not a public purpose
        login = c.post(reverse("auth-request-otp"), {"email": "nosy@naada.test"}, format="json")
        self.assertEqual(self.delete(self.stranger, code=login.data["debug_otp"]).status_code, 400)

    def test_erasure_removes_personal_data_but_keeps_the_financial_skeleton(self):
        u = self.buyer
        record(u, notification_type=NotificationType.WELCOME, title="Hi", body="b")
        ticket = self.ticket
        order = ticket.order
        order.ip_address = "203.0.113.9"; order.user_agent = "TestBrowser"; order.save()
        # Past event so the ticket doesn't need acknowledging.
        self.event.start_datetime = timezone.now() - timedelta(days=3)
        self.event.end_datetime = timezone.now() - timedelta(days=3) + timedelta(hours=3)
        self.event.save()
        old_email = u.email

        # (The buyer also holds a ticket to another, upcoming event.)
        code = self.code_for(u)
        r = self.delete(u, code=code, acknowledge_losses=True)
        self.assertEqual(r.status_code, 200, r.data)

        u.refresh_from_db()
        self.assertFalse(u.is_active)
        self.assertTrue(u.is_deleted)
        self.assertNotEqual(u.email, old_email)
        self.assertEqual(u.full_name, "Deleted user")
        self.assertFalse(Notification.objects.filter(user=u).exists())
        self.assertFalse(OTPToken.objects.filter(email=old_email).exists())

        ticket.refresh_from_db(); order.refresh_from_db()
        self.assertEqual(ticket.holder_email, "")
        self.assertEqual(ticket.holder_phone, "")
        self.assertEqual(ticket.holder_name, "Deleted user")
        self.assertIsNone(order.ip_address)
        self.assertEqual(order.user_agent, "")
        # The record the tax office cares about is still there.
        self.assertTrue(Ticket.objects.filter(pk=ticket.pk).exists())
        self.assertEqual(float(order.total_amount), 100.0)

    def test_gatekeeper_access_and_invites_are_erased(self):
        self.make_active()
        GateAssignment.objects.create(event=self.future_event, invited_by=self.host,
                                      invitee_email=self.gk.email)
        code = self.code_for(self.gk)
        self.assertEqual(self.delete(self.gk, code=code).status_code, 200)
        self.assertEqual(GateAssignment.objects.filter(invitee_email__iexact="gate@naada.test").count(), 0)

    def test_erasure_signs_every_session_out(self):
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
        RefreshToken.for_user(self.stranger)
        code = self.code_for(self.stranger)
        self.assertEqual(self.delete(self.stranger, code=code).status_code, 200)
        self.assertTrue(BlacklistedToken.objects.exists())
