"""A dead or over-quota Redis must not take the API down.

The outage these cover: a hosted Redis hit its monthly request limit. The health
probe (which wrote to Redis on every poll) started answering 503, so the host
stopped routing to a perfectly good API, and every rate-limited POST would have
raised as well.
"""

from unittest import mock

from django.core.cache import caches
from django.test import SimpleTestCase, TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from apps.core import resilient_cache
from apps.core.resilient_cache import ResilientRedisCache

# Nothing listens on port 9: every Redis call fails at once, like a refused or over-quota server.
DEAD_REDIS = {
    "default": {
        "BACKEND": "apps.core.resilient_cache.ResilientRedisCache",
        "LOCATION": "redis://127.0.0.1:9/0",
        "OPTIONS": {"socket_connect_timeout": 1, "socket_timeout": 1},
    }
}


class HealthCheckTests(TestCase):
    def get(self, query=""):
        return APIClient().get(reverse("health") + query)

    def test_a_healthy_database_is_a_200(self):
        resp = self.get()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "ok")
        self.assertEqual(resp.data["components"]["database"], "ok")

    def test_the_probe_never_touches_the_cache_so_it_cannot_burn_a_redis_quota(self):
        with mock.patch("naada.urls._check_cache") as check:
            self.get()
        check.assert_not_called()

    @override_settings(CACHES=DEAD_REDIS)
    def test_a_dead_redis_does_not_make_the_service_unhealthy(self):
        resp = self.get()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["status"], "ok")

    @override_settings(CACHES=DEAD_REDIS)
    def test_a_deep_check_reports_a_cache_problem_but_still_answers_200(self):
        with mock.patch("naada.urls._check_cache", side_effect=RuntimeError("max requests limit exceeded")):
            resp = self.get("?deep=1")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["components"]["cache"].startswith("degraded"))
        self.assertEqual(resp.data["status"], "ok")

    def test_a_dead_database_is_still_a_503(self):
        with mock.patch("naada.urls._check_database", side_effect=RuntimeError("down")):
            resp = self.get()
        self.assertEqual(resp.status_code, 503)
        self.assertEqual(resp.data["status"], "unhealthy")


@override_settings(CACHES=DEAD_REDIS)
class ResilientCacheTests(SimpleTestCase):
    def setUp(self):
        resilient_cache.COOLDOWN = 30
        cache = caches["default"]
        cache.clear()
        # The breaker is per cache object and the previous test may have tripped it.
        cache._down_until = 0.0

    def test_the_cache_keeps_working_with_redis_gone(self):
        cache = caches["default"]
        cache.set("k", "v", 60)
        self.assertEqual(cache.get("k"), "v")
        self.assertTrue(cache.add("once", 1, 60))
        self.assertFalse(cache.add("once", 2, 60))
        self.assertEqual(cache.incr("once"), 2)
        cache.delete("k")
        self.assertIsNone(cache.get("k"))
        self.assertEqual(cache.get_many(["once", "missing"]), {"once": 2})

    def test_throttle_counters_still_count_so_rate_limits_hold_per_process(self):
        cache = caches["default"]
        cache.set("throttle:x", [1], 60)
        history = cache.get("throttle:x", [])
        history.append(2)
        cache.set("throttle:x", history, 60)
        self.assertEqual(cache.get("throttle:x"), [1, 2])

    def test_redis_is_left_alone_after_a_failure_instead_of_retried_on_every_call(self):
        cache = caches["default"]
        calls = []
        real = ResilientRedisCache.__mro__[1].get  # RedisCache.get

        def failing(self, *a, **k):
            calls.append(1)
            raise ConnectionError("max requests limit exceeded")

        with mock.patch.object(ResilientRedisCache.__mro__[1], "get", failing):
            for _ in range(10):
                cache.get("anything")
        self.assertEqual(len(calls), 1, "the other nine calls should not have gone to Redis")
        self.assertTrue(real)

    def test_redis_is_tried_again_once_the_cooldown_has_passed(self):
        cache = caches["default"]
        calls = []

        def failing(self, *a, **k):
            calls.append(1)
            raise ConnectionError("down")

        with mock.patch.object(ResilientRedisCache.__mro__[1], "get", failing):
            cache.get("a")
            cache._down_until = 0  # the cool-down has passed
            cache.get("a")
        self.assertEqual(len(calls), 2)

    def test_a_working_redis_is_used_when_there_is_one(self):
        cache = caches["default"]
        with mock.patch.object(ResilientRedisCache.__mro__[1], "get", return_value="from-redis"):
            self.assertEqual(cache.get("k"), "from-redis")

    def test_the_first_failure_is_logged_once_not_for_every_request(self):
        cache = caches["default"]
        with self.assertLogs("apps.core.resilient_cache", level="ERROR") as logs:
            for _ in range(5):
                cache.get("x")
        self.assertEqual(len(logs.records), 1)


@override_settings(CACHES=DEAD_REDIS)
class RateLimitedEndpointsSurviveRedisOutageTests(TestCase):
    def test_a_rate_limited_post_is_not_a_500_when_redis_is_down(self):
        # Sign-in requests go through the OTP throttles, which count in the cache.
        resp = APIClient().post(reverse("auth-request-otp"), {"email": "someone@example.com"}, format="json")
        self.assertNotEqual(resp.status_code, 500, resp.content[:200])


class CeleryRedisUsageTests(SimpleTestCase):
    """A hosted Redis meters every command; an idle worker must not spend them."""

    def test_results_are_not_written_to_redis(self):
        from django.conf import settings
        self.assertTrue(settings.CELERY_TASK_IGNORE_RESULT)

    def test_publishing_from_a_request_gives_up_quickly_on_a_dead_broker(self):
        from django.conf import settings
        policy = settings.CELERY_TASK_PUBLISH_RETRY_POLICY
        self.assertLessEqual(policy["max_retries"], 2)
        self.assertLessEqual(policy["interval_max"], 1)

    def test_the_idle_worker_polls_rarely_on_a_tls_redis(self):
        import importlib
        import os
        from unittest import mock
        base = importlib.import_module("naada.settings.base")
        try:
            with mock.patch.dict(os.environ, {"REDIS_URL": "rediss://default:x@example.upstash.io:6379"}):
                base = importlib.reload(base)
            options = base.CELERY_BROKER_TRANSPORT_OPTIONS
            self.assertGreaterEqual(options["polling_interval"], 30)
            self.assertGreaterEqual(options["health_check_interval"], 60)
        finally:
            importlib.reload(base)
