"""Tests for role selection.

`PATCH /auth/me/` never had `role` on its write serializer — role selection
at signup was silently a no-op, masked only by the frontend faking the role
locally for the rest of that browser session. On any later login the account
came back as `attendee` regardless of what the user actually picked, losing
access to their own dashboard. `set_role` is the real fix; these tests pin
both that it actually persists and that it can never be used to grant admin.
"""

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.test import TestCase
from rest_framework.test import APIClient

from apps.artists.models import Artist
from .models import UserRole

User = get_user_model()


class SetRoleTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(email="role-test@naada.test", full_name="Role Test")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_selecting_artist_persists_the_role(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ARTIST)

    def test_selecting_artist_creates_a_bookable_artist_row(self):
        self.assertFalse(Artist.objects.filter(user=self.user).exists())
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertTrue(Artist.objects.filter(user=self.user).exists())

    def test_selecting_artist_twice_does_not_duplicate_the_artist_row(self):
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.client.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(Artist.objects.filter(user=self.user).count(), 1)

    def test_selecting_venue_owner_persists_and_creates_nothing_extra(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "venue_owner"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.VENUE_OWNER)
        self.assertFalse(Artist.objects.filter(user=self.user).exists())

    def test_cannot_self_promote_to_admin(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "admin"}, format="json")
        self.assertEqual(resp.status_code, 400)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ATTENDEE)

    def test_garbage_role_value_is_rejected(self):
        resp = self.client.post(reverse("auth-set-role"), {"role": "superuser"}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_requires_authentication(self):
        anon = APIClient()
        resp = anon.post(reverse("auth-set-role"), {"role": "artist"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_patching_me_cannot_change_role(self):
        """The bug this whole endpoint exists to fix, pinned directly: the
        general profile-update path must never be able to touch role, in
        either direction — not silently ignoring it (the original bug) and
        not accidentally accepting it later (the security risk)."""
        resp = self.client.patch(reverse("auth-me"), {"role": "admin"}, format="json")
        self.assertEqual(resp.status_code, 200, resp.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, UserRole.ATTENDEE)
