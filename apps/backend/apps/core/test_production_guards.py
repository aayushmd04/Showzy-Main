"""Production must refuse to start in configurations that hand out free tickets.

Run as real subprocesses: these are import-time guards in settings/production.py, and
settings are process-wide, so they cannot be exercised from inside a running test.
"""

import os
import subprocess
import sys
from pathlib import Path

from django.test import SimpleTestCase

BACKEND = Path(__file__).resolve().parents[2]

BASE_ENV = {
    "PATH": os.environ.get("PATH", ""),
    "DJANGO_ENV": "naada.settings.production",
    "SECRET_KEY": "ci-only-key-not-used-anywhere-real-9f2a7c4e1b8d6053",
    "DATABASE_URL": "postgresql://ci:ci@127.0.0.1:5432/ci",
    "ALLOWED_HOSTS": "ci.example.com",
    "CORS_ALLOWED_ORIGINS": "https://ci.example.com",
}


def boot(**env):
    """Return (exit code, combined output) of ``manage.py check`` under production settings."""
    result = subprocess.run(
        [sys.executable, "manage.py", "check"],
        cwd=BACKEND, env={**BASE_ENV, **env}, capture_output=True, text=True, timeout=120,
    )
    return result.returncode, result.stdout + result.stderr


class MockGatewayInProductionTests(SimpleTestCase):
    def test_refuses_the_mock_gateway_by_default(self):
        code, out = boot()
        self.assertNotEqual(code, 0)
        self.assertIn("free tickets", out)

    def test_refuses_it_when_named_explicitly_too(self):
        self.assertNotEqual(boot(PAYMENT_GATEWAY="mock")[0], 0)

    def test_refuses_an_unknown_gateway(self):
        self.assertNotEqual(boot(PAYMENT_GATEWAY="stripe")[0], 0)

    def test_starts_when_somebody_opts_in_on_purpose(self):
        code, out = boot(PAYMENT_GATEWAY="mock", ALLOW_MOCK_PAYMENTS="true")
        self.assertEqual(code, 0, out)

    def test_starts_on_razorpay(self):
        code, out = boot(PAYMENT_GATEWAY="razorpay")
        self.assertEqual(code, 0, out)

    def test_the_opt_in_uses_private_mock_secrets_not_the_ones_in_the_source(self):
        script = (
            "import django; django.setup();"
            "from django.conf import settings;"
            "print(settings.MOCK_PAYMENT_KEY_SECRET, settings.MOCK_PAYMENT_WEBHOOK_SECRET)"
        )
        result = subprocess.run(
            [sys.executable, "-c", script], cwd=BACKEND, capture_output=True, text=True, timeout=120,
            env={**BASE_ENV, "PAYMENT_GATEWAY": "mock", "ALLOW_MOCK_PAYMENTS": "true",
                 "DJANGO_SETTINGS_MODULE": "naada.settings.production"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        key_secret, webhook_secret = result.stdout.split()
        self.assertNotIn("naada_mock_secret_dev_only", result.stdout)
        self.assertEqual(len(key_secret), 64)
        self.assertNotEqual(key_secret, webhook_secret)
