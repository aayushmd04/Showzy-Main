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
- [x] C7/C8 venue management + file upload primitive
- [x] C9 gig application review

### Phase 3 — artist tools
- [x] D1 create Artist row on role select
- [x] D2 profile builder against real API
- [x] D4 photo upload
- [x] D5 availability

### Phase 4 — retention & discovery
- [x] E4/E5 notifications UI + emit on real events
- [x] E2/E3 server-side search and filters
- [x] E7/G10 per-event meta tags, prerender, sitemap
- [x] E8–E14 save, follow, reviews, ics, ticket transfer, venue map
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

## Verified end to end (2026-09-10)
- Frontend build clean; **82 frontend tests**, **64 backend tests**, all passing.
- Live purchase against a running backend: OTP sign-in, order for 2 x Rs 249
  + Rs 38 booking fee = Rs 536, mock gateway with Razorpay-shaped ids, real
  HMAC verified, order confirmed, 2 tickets issued with QR images, receipt
  email rendered with the real ticket numbers. A tampered signature is refused.
- Every route walked in a browser — public, host, artist, admin, legal, 404:
  no crash, no blank screen, no broken image, and each has its own title.
- Bought a ticket through the real screens: event page at Rs 369 -> checkout at
  the same Rs 369 -> mock gateway -> ticket JAZ-00001 with the server's real
  scannable QR and "Paid Rs 369". Scanned that QR at the door endpoint: admitted,
  ticket marked used, and a second scan of the same code correctly refused.

## Known limits of today's verification
- The service worker could not be registered inside the embedded test browser,
  which blocks them. The script parses, is served as text/javascript, and its
  registration is wrapped so a failure is a silent no-op — the page rendered
  perfectly with registration failing, which is the fallback proving itself.
  Worth confirming on a real phone before relying on the offline ticket.
- Docker images were never built; Docker is not installed on this machine. The
  Dockerfiles and compose file are syntax-checked only.
- Production settings resolved against a Supabase pooler URL: Postgres,
  sslmode=require, CONN_MAX_AGE=60, DEBUG off, OTP never echoed. Both boot
  guards fire (SQLite refused, placeholder SECRET_KEY refused).

## Still open (nothing here blocks a deploy)
- F3 GST is still zero on every order. Needs a CA's input, not a code decision.
- E12 Kannada is half-built — the toggle changes nav labels and little else.
- Social link previews need the prerender step in DEPLOY.md; per-route meta
  tags work today for search engines that run JavaScript.
- (E11 ticket transfer and E13 venue maps have shipped: transfer reissues the
  QR and notifies the recipient; the event page shows the address and a
  "Get directions" link from the venue's Google Maps link.)

## Deployment answers owed to the founder
- Supabase = Postgres/storage only; it does not host Django. Recommendation and
  full steps land in `DEPLOY.md`.
- Frontend goes to a static/CDN host; backend needs a container host that
  supports WebSockets + a worker + a scheduler.

---

# Run 2 — overnight readiness sprint, 2026-09-15

Brief: expand the home page, verify the backend, find and fix whatever else is
gapped, and leave three deployment documents. Worked unattended.

## The three documents

Published as artifacts, not committed here, because they are for reading on a
phone rather than in an editor:

- **SQLite to Supabase** — https://claude.ai/code/artifact/61f346e5-ad75-4eba-bff6-7cc5b1e59241
- **Naada on Cloudflare** — https://claude.ai/code/artifact/7d09737b-63af-4840-8282-e60b5c98adb0
- **The Free Stack** — https://claude.ai/code/artifact/6cfc6233-eb9a-4ade-844d-1a22956aab5a

Short version of the Cloudflare answer: the React site yes, brilliantly and for
nothing; the Django API no, and not for a reason you can configure around —
Workers runs V8 isolates, not Linux processes, so there is no CPython, no
psycopg2, no long-lived WebSocket, no Celery. Put the API on Render. Take
Cloudflare's DNS, CDN and R2 anyway; R2 in particular has no egress charge,
which matters for a site made of posters.

## What shipped

Every item below was verified against a running server or a real browser, not
just unit-tested. Commits carry the detail.

- Home page: one rail became seven sections — genre tiles, this week (now
  genuinely seven days), coming up, artists, rooms, three steps, and a panel
  for artists and hosts. Every rail is real data or it is not rendered.
- `TODAY` was a fixture constant pinned to 2026-08-20. Four screens used it to
  decide what counts as upcoming, so a deployment would have advertised gigs
  that had already happened, forever. Now the viewer's local date.
- OTP was rate limited per IP only. Rotating IPs is cheap, so a chosen inbox
  could be flooded — and the free email tier's quota with it. Second budget
  added, keyed on the recipient.
- `manage.py check --deploy` now warns on the two silent deploys: no shared
  cache for throttle counters (naada.W001), and a console email backend, which
  means nobody can sign in at all (naada.W002).
- Admin Disputes crashed to the error boundary on its first real dispute: the
  date formatters threw on an ISO timestamp. Fixed at the source; formatters
  now return a dash rather than removing the page.
- The host dashboard read the public event catalogue, so a host saw other
  venues' nights and the whole platform's revenue as their own.
- Check-in required only a signed-in account. A forwarded ticket screenshot
  was enough to burn someone's ticket before they arrived. Organiser-only now.
- `GET /events/<id>/attendees/` is new: the door list the scanner's manual
  lookup always needed. It had been searching the host's own tickets.
- Every public page scrolled sideways on a phone — an inline `display: flex`
  beat the media query meant to hide the nav links. 681px in a 375px viewport.
- The service worker served the cached HTML first, so a returning visitor kept
  running the previous build after every deploy.
- Bundle split: 92KB gzipped of vendor now survives a deploy instead of being
  re-downloaded.
- `tools/smoke_test.py` — 24 checks against a running server, end to end.

## Counts at the end of the run

232 backend tests, 91 frontend tests, typecheck and build clean,
`check --deploy` clean apart from the two warnings above, which are true.

## Still open

- Everything in Run 1's "Still open" that isn't ticked above: GST is still
  zero (needs a CA, not a commit), Kannada is still partial, social previews
  still need the prerender step for scrapers that don't run JavaScript.
- The local database holds 31 users and 24 orders, all of it QA. Document 1
  recommends starting production empty rather than carrying it across.
- `/lab/keyboard` is a component lab on a public route. Harmless and lazily
  loaded, but it is a dev tool on the live site.
- Nothing has been pushed. `origin/main` is untouched.
