# syntax=docker/dockerfile:1
#
# Showzy backend — Django 5.1 + DRF + Channels (ASGI) + Celery.
#
# Build context is apps/backend/ :
#     docker build -t naada-backend apps/backend
#
# One image, three roles. The role is chosen by the command, not by the image:
#     web    -> daphne  (default CMD)
#     worker -> celery -A naada worker ...
#     beat   -> celery -A naada beat ...
#
# ── Why daphne and not gunicorn ──────────────────────────────────────────────
# This app serves WebSockets (apps/chat) through Django Channels. Gunicorn's
# own workers speak WSGI, and WSGI has no concept of a WebSocket upgrade — a
# gunicorn-only deploy answers /ws/chat/... with a 404 or a 500 and the chat
# silently never connects. Daphne is the reference ASGI server maintained by
# the Channels project, it is already pinned in requirements.txt, and it serves
# ordinary HTTP and WebSockets on the same port. gunicorn stays in
# requirements.txt because it is harmless, but nothing here runs it.
# (The other valid option is `gunicorn -k uvicorn.workers.UvicornWorker`, which
# needs uvicorn added to requirements.txt. Daphne needs nothing extra.)

##############################################################################
# Stage 1 — builder.  Compilers and headers live here and never ship.
##############################################################################
FROM python:3.13-slim AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1

# build-essential + libpq-dev are only needed if pip has to compile a wheel
# from source (psycopg2, cryptography and Pillow normally ship binary wheels,
# but a base-image bump can change that and this keeps the build from
# breaking at the worst possible moment).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Self-contained virtualenv, copied wholesale into the runtime stage. This is
# what keeps the compilers out of the final image.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt ./
RUN pip install --upgrade pip setuptools wheel \
    && pip install -r requirements.txt

##############################################################################
# Stage 2 — runtime.  Interpreter + venv + source. No build toolchain.
##############################################################################
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH" \
    DJANGO_ENV=naada.settings.production \
    PORT=8000

# Non-root. Fixed uid so bind-mounted volumes have predictable ownership.
RUN useradd --create-home --uid 10001 --shell /usr/sbin/nologin naada

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=naada:naada . .

RUN mkdir -p /app/staticfiles /app/media && chown -R naada:naada /app

USER naada

# Collectstatic at BUILD time so the running container never needs to write to
# the image and never pays the cost on boot.
#
# The values below are throwaway build-time placeholders: collectstatic only
# needs the settings module to import cleanly, it opens no database socket and
# no Redis socket. Real values arrive as environment variables at run time.
#
# DATABASE_URL must look like Postgres: production.py refuses SQLite at import time,
# so a SQLite placeholder here fails the build. Nothing ever connects to this one.
#
# ALLOW_MOCK_PAYMENTS is set on this one command only, never as ENV: production.py refuses the
# mock gateway at import time, and the build has no real payment credentials. The running
# container does not get it, so it still needs real Razorpay keys (or its own opt-in).
RUN ALLOW_MOCK_PAYMENTS="true" \
    SECRET_KEY="build-time-placeholder-not-used-at-runtime" \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    ALLOWED_HOSTS="*" \
    CORS_ALLOWED_ORIGINS="http://localhost" \
    REDIS_URL="redis://localhost:6379/0" \
    python manage.py collectstatic --noinput --clear

EXPOSE 8000

# Liveness probe. Uses the stdlib rather than adding curl to the image.
# Anything under HTTP 400 counts as alive — that deliberately tolerates the
# 301 that SECURE_SSL_REDIRECT issues for a plain-HTTP loopback request, while
# still failing on a 4xx (DisallowedHost) or 5xx (app broken).
# ALLOWED_HOSTS must contain 127.0.0.1 for this to return 200; see DEPLOY.md.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD python -c 'import os,sys,urllib.request as u; \
url="http://127.0.0.1:"+os.environ.get("PORT","8000")+"/api/v1/health/"; \
req=u.Request(url, headers={"X-Forwarded-Proto":"https"}); \
sys.exit(0 if u.urlopen(req, timeout=4).status < 400 else 1)'

# Default role: the ASGI web process.
# --proxy-headers makes daphne trust X-Forwarded-For / X-Forwarded-Proto from
# the platform's load balancer, which is what every host in DEPLOY.md sits
# behind. `exec` so daphne is PID 1 and receives SIGTERM on shutdown.
CMD ["sh", "-c", "exec daphne -b 0.0.0.0 -p ${PORT:-8000} --proxy-headers naada.asgi:application"]
