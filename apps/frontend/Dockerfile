# syntax=docker/dockerfile:1
#
# Showzy frontend — Vite production build served by nginx.
#
# IMPORTANT: the build context is the REPOSITORY ROOT, not apps/frontend.
# package-lock.json lives at the root (this is an npm workspaces monorepo) and
# `npm ci` refuses to run without it. Build like this:
#
#     docker build -f apps/frontend/Dockerfile \
#                  --build-arg VITE_API_BASE=https://naada-api.onrender.com/api/v1 \
#                  -t naada-frontend .
#                                    ^ the dot is the repo root
#
# ── Why the API URL is a --build-arg and not an environment variable ─────────
# Vite is a compiler. It substitutes import.meta.env.VITE_API_BASE with a
# string literal while bundling, then throws the environment away. By the time
# nginx serves the files there is nothing left to configure — the URL is inside
# the .js file. Pointing this image at a different backend means rebuilding it.

##############################################################################
# Stage 1 — build the bundle
##############################################################################
FROM node:25-alpine AS builder

WORKDIR /repo

# Manifests first, sources second: as long as dependencies do not change,
# Docker reuses the cached `npm ci` layer and rebuilds are seconds not minutes.
COPY package.json package-lock.json ./
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN npm ci

COPY apps/frontend ./apps/frontend

# Defaults are the local-development values so a bare `docker build .` still
# produces something that runs. Override VITE_API_BASE for any real deploy.
ARG VITE_API_BASE=http://localhost:8000/api/v1
ARG VITE_SENTRY_DSN_FRONTEND=""
ARG VITE_ANALYTICS_KEY=""
ARG VITE_ANALYTICS_HOST=""
ARG VITE_TURNSTILE_SITE_KEY=""

ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_SENTRY_DSN_FRONTEND=$VITE_SENTRY_DSN_FRONTEND \
    VITE_ANALYTICS_KEY=$VITE_ANALYTICS_KEY \
    VITE_ANALYTICS_HOST=$VITE_ANALYTICS_HOST \
    VITE_TURNSTILE_SITE_KEY=$VITE_TURNSTILE_SITE_KEY

# `npm run build` is `tsc -b && vite build` — the type check is part of the
# build on purpose, so a type error fails here rather than in production.
RUN npm run build --workspace apps/frontend

##############################################################################
# Stage 2 — serve. Static files and nginx only; no Node, no node_modules.
##############################################################################
FROM nginx:1.31-alpine AS runtime

# Replaces the stock config. See apps/frontend/nginx.conf — the try_files line
# in there is what stops deep links like /host/events/<id> returning 404.
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /repo/apps/frontend/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
