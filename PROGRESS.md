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
- [ ] A2 Celery app never instantiated
- [ ] A3 any user can edit any artist profile
- [ ] A4 wsgi/asgi point at wrong settings
- [ ] A5 DATABASE_URL ignored
- [ ] F4 debug_otp leak
- [ ] G13 health check checks nothing
- [ ] D3 GET /artists/mine/

### Phase 1 — money path
- [ ] Payment gateway abstraction + faithful mock
- [ ] B8 refunds actually move money
- [ ] Webhook idempotency
- [ ] Frontend API client: order/payment/promo functions
- [ ] B1–B5 rewrite checkout against real endpoints
- [ ] B6 expire abandoned orders (inventory leak)
- [ ] B7 order confirmation email + ticket delivery
- [ ] A6/A7/A8 token refresh, 401 handling, real logout
- [ ] E1 pagination (site currently hard-caps at 20 events)

### Phase 2 — host tools
- [ ] C1/C2/C3 event create, save, publish against the API
- [ ] C4/C5 real door scanner
- [ ] C6 persist venue layout server-side
- [ ] C7/C8 venue management + file upload primitive
- [ ] C9 gig application review

### Phase 3 — artist tools
- [ ] D1 create Artist row on role select
- [ ] D2 profile builder against real API
- [ ] D4 photo upload
- [ ] D5 availability

### Phase 4 — retention & discovery
- [ ] E4/E5 notifications UI + emit on real events
- [ ] E2/E3 server-side search and filters
- [ ] E7/G10 per-event meta tags, prerender, sitemap
- [ ] E8–E14 save, follow, reviews, transfer, map, ics
- [ ] E12 Kannada
- [ ] G11 websocket chat

### Phase 5 — ship
- [ ] F1 legal pages (gates Razorpay merchant approval — do early)
- [ ] F2 account deletion / export
- [ ] F3 GST
- [ ] G1/G4 tests on money + auth paths
- [ ] G2/G3 env-based API base, Docker, CI
- [ ] G5/G6/G7 Sentry, analytics, error boundary
- [ ] G8/G9/G12/G14/G15 storage, redis, docs, splitting, PWA

## Deployment answers owed to the founder
- Supabase = Postgres/storage only; it does not host Django. Recommendation and
  full steps land in `DEPLOY.md`.
- Frontend goes to a static/CDN host; backend needs a container host that
  supports WebSockets + a worker + a scheduler.
