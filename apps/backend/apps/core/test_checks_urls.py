from django.test import SimpleTestCase, override_settings

from apps.core.checks import public_urls_must_not_be_local


def ids():
    return sorted(w.id for w in public_urls_must_not_be_local(None))


@override_settings(DEBUG=False)
class PublicUrlCheckTests(SimpleTestCase):
    @override_settings(FRONTEND_URL="http://localhost:5173", CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_warns_about_both_when_left_at_defaults(self):
        self.assertEqual(ids(), ["naada.W006", "naada.W007"])

    @override_settings(FRONTEND_URL="https://showzy.in", CORS_ALLOWED_ORIGINS=["https://showzy.in"])
    def test_quiet_when_set(self):
        self.assertEqual(ids(), [])

    @override_settings(
        FRONTEND_URL="https://showzy.in",
        CORS_ALLOWED_ORIGINS=["http://localhost:5173", "https://showzy.in"],
    )
    def test_one_real_origin_is_enough_for_cors(self):
        self.assertEqual(ids(), [])

    @override_settings(FRONTEND_URL="http://127.0.0.1:5173", CORS_ALLOWED_ORIGINS=["https://showzy.in"])
    def test_loopback_address_counts_as_local(self):
        self.assertEqual(ids(), ["naada.W006"])

    @override_settings(DEBUG=True, FRONTEND_URL="http://localhost:5173", CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_silent_in_development(self):
        self.assertEqual(ids(), [])
