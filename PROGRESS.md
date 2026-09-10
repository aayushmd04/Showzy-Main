# Naada — Production Readiness Run

**Session started:** 2026-09-10 09:00 IST
**Target:** everything deployable and error-free by 19:00 IST 2026-09-10
**Audit source of truth:** https://claude.ai/code/artifact/54fc05d3-35af-4516-b177-753071080178 (66 findings, IDs A1–G15)

## How to resume this work

If the session died, hit a limit, or you are a fresh session: read this file,
then run `git log --oneline -15` to see what actually landed. Trust the git log
over the checkboxes below if they disagree. Pick up the first unchecked item.

Constraints that apply to every task:
- **No Razorpay account yet.** Payments run through a mock gateway that is
  byte-compatible with Razorpay. Flipping `PAYMENT_GATEWAY=razorpay` plus real
  keys must be the *only* change needed to go live. Never make the mock a
  special case in calling code.
- Same rule for every other paid third party (Sentry, S3, SMS, push): model the
  integration, no-op cleanly when credentials are absent, never crash.
- Work on `main`, commit in small labelled increments. `origin/main` is the
  escape hatch.

## Status

### Phase 0 — stop the bleeding
- [x] A1 missing `models` import in tickets/views.py (was a guaranteed 500)
- [x] A2 Celery app never instantiated
- [x] A3 any user can edit any artist profile
- [x] A4 wsgi/asgi point at wrong settings
- [x] A5 DATABASE_URL ignored
- [x] F4 debug_otp leak
- [x] G13 health check checks nothing
- [x] D3 GET /artists/mine/

### Phase 1 — money path
- [x] Payment gateway abstraction + faithful mock
- [x] B8 refunds actually move money
- [x] Webhook idempotency
- [x] Frontend API client: order/payment/promo functions
- [x] B1–B5 rewrite checkout against real endpoints
- [x] B6 expire abandoned orders (inventory leak)
- [x] B7 order confirmation email + ticket delivery
- [x] A6/A7/A8 token refresh, 401 handling, real logout
- [x] E1 pagination (site currently hard-caps at 20 events)

### Phase 2 — host tools
- [x] C1/C2/C3 event create, save, publish against the API
- [x] C4/C5 real door scanner
- [x] C6 persist venue layout server-side
- [ ] C7/C8 venue management + file upload primitive
- [x] C9 gig application review

### Phase 3 — artist tools
- [x] D1 create Artist row on role select
- [x] D2 profile builder against real API
- [x] D4 photo upload
- [x] D5 availability

### Phase 4 — retention & discovery
- [ ] E4/E5 notifications UI + emit on real events
- [x] E2/E3 server-side search and filters
- [ ] E7/G10 per-event meta tags, prerender, sitemap
- [ ] E8–E14 save, follow, reviews, transfer, map, ics
- [ ] E12 Kannada
- [ ] G11 websocket chat

### Phase 5 — ship
- [x] F1 legal pages (gates Razorpay merchant approval — do early)
- [x] F2 account deletion / export
- [ ] F3 GST
- [x] G1/G4 tests on money + auth paths
- [x] G2/G3 env-based API base, Docker, CI
- [x] G5/G6/G7 Sentry, analytics, error boundary
- [ ] G8/G9/G12/G14/G15 storage, redis, docs, splitting, PWA

## Deployment answers owed to the founder
- Supabase = Postgres/storage only; it does not host Django. Recommendation and
  full steps land in `DEPLOY.md`.
- Frontend goes to a static/CDN host; backend needs a container host that
  supports WebSockets + a worker + a scheduler.
