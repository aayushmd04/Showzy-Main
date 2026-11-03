# Third-party package audit

*Run 11 Oct 2026 on the local checkout. Tools: `npm audit`, `pip-audit`, `pip-licenses`, `npm outdated`, `pip list --outdated`.*

## Result in one table

| | Before | After | Notes |
|---|---|---|---|
| **Frontend (npm)** known vulnerabilities | **4** (2 high, 2 moderate) | **0** | `react-router-dom` 6 → 7; transitive `undici`, `source-map-js` patched. |
| **Backend (pip)** known vulnerabilities | **96** across 9 packages | **1** | Remaining one is build-time only (see below). |
| Third-party **requests when a visitor browses** | Google Fonts (visitor IP sent to Google) | **None** | Fonts are now self-hosted. |
| Test suites | 279 backend / 96 frontend | **290 backend / 113 frontend**, all passing | New tests cover consent, export and erasure. |

## What was upgraded and why

### Backend

| Package | From → To | Why |
|---|---|---|
| **Django** | 5.1.4 → **5.2.18 (LTS)** | 5.1 is end-of-life; 32 known CVEs (SQL injection, DoS, header and path issues). 5.2 is supported to April 2028. |
| **Pillow** | 11.1.0 → **12.3.0** | 33 CVEs in image decoders. Pillow decodes **user-uploaded** photos, so this is the most exposed library. |
| cryptography | 44.0.2 → **50.0.2** | 10 CVEs. |
| djangorestframework | 3.15.2 → **3.17.2** | 2 CVEs (parser abuse, AdminRenderer data disclosure). |
| djangorestframework-simplejwt | 5.3.1 → **5.5.1** | Information-disclosure CVE in the **login token** library. |
| daphne | 4.1.2 → **4.2.3** | 4 CVEs (request reconstruction, WebSocket payload limits) — it is our public server for chat. |
| channels / channels-redis | 4.2.0/4.2.1 → 4.3.2 / 4.3.0 | Kept in step with Daphne. |
| twisted, pyOpenSSL | 25.5.0 / 25.1.0 → **26.4.0 / 26.4.0** | 3 + 4 CVEs; pulled in by Daphne, so pinned as floors in `requirements.txt`. |
| django-cors-headers, django-celery-beat | 4.6.0 → 4.9.0, 2.7.0 → 2.9.0 | Required by the Django 5.2 move. |
| setuptools | 69.5.1 → **80.9.0** | Fixes two advisories. **Cannot go higher** (see below). |

### Frontend

| Package | Change | Why |
|---|---|---|
| **react-router-dom** | 6 → **7.18.4** | Two moderate CVEs (open redirect via backslash, constructor injection). **A real behaviour change came with it** — see "Fixed on the way". |
| undici, source-map-js | patched via `npm audit fix` | Dev-tooling transitive (test/build only), high-severity DoS advisories. |
| @fontsource/* (6 fonts) | **added** | Replaces Google Fonts CDN. SIL OFL 1.1 — free to self-host and redistribute. |

### Fixed on the way

- **Post-payment redirect race (React Router 7).** After a successful payment the checkout page cleared its draft, which triggered its own "nothing to pay for → go Home" redirect. React Router 7 runs navigations in a transition, so Home could win and a buyer would land on the home page instead of their ticket (two existing tests caught it). `checkout-pay.tsx` now marks itself as "leaving" before clearing, so it can't redirect itself away.

## The one remaining advisory

`setuptools 80.9.0 — PYSEC-2026-3447` (fixed in 83.0.0): when **building a source distribution on macOS**, a Unicode-normalisation quirk could let a file that should be excluded be packed. It affects people who run `python -m build --sdist`, not a running server. We stay below 83 because **`razorpay==1.4.2` imports `pkg_resources`, which setuptools ≥ 81 removed.** Razorpay SDK 2.0.1 no longer needs it, but it is a major version of a payments client and must be tested against Razorpay's sandbox before it ships.

**Action:** plan the Razorpay 2.x upgrade with sandbox testing, then raise setuptools. Until then the risk is accepted (no runtime exposure).

## Runtime third parties — who receives what

| Service | When it is contacted | What it receives | Where in the code |
|---|---|---|---|
| **Razorpay** (payments) | Only when a buyer presses Pay (checkout script `checkout.razorpay.com`) and from our server for orders/refunds | Amount, order reference; the payer enters card/UPI details on Razorpay's own page | `checkout-pay.tsx`, `apps/payments/` |
| **Email provider** (SMTP) | Sign-in codes, tickets, deletion codes, notices | Recipient email, message body | `apps/users/views.py`, `apps/notifications/dispatch.py` |
| **Sentry** *(optional — only if `SENTRY_DSN_BACKEND` is set)* | Server errors | Stack traces; keep personal data out of exception messages | `requirements.txt`, settings |
| **AWS S3 / compatible** *(optional — only if `AWS_STORAGE_BUCKET_NAME` is set)* | Uploads and media reads | Photos, QR images | `django-storages` |
| **Database host** (Postgres, e.g. Supabase) | Every request | All application data | `DATABASE_URL` |
| **Redis** | Chat/WebSocket layer, Celery | Message payloads in transit | `channels-redis`, `celery` |
| ~~Google Fonts~~ | *(removed)* | *(was: every visitor's IP address and browser)* | `index.html`, `styles/fonts.css` |

No analytics, advertising, social-media or tag-manager scripts exist in the frontend. The browser only talks to our own origin and API.

## Licences

**Frontend (direct):** MIT (react, react-dom, react-router-dom, swr, motion, clsx, tailwind-merge, tailwindcss, vite, vitest and the testing libraries), ISC (lucide-react), Apache-2.0 (typescript), **OFL-1.1** (the six `@fontsource` fonts). No copyleft in anything shipped to browsers.

**Backend (102 packages in the environment):** overwhelmingly MIT / BSD / Apache-2.0. Items worth knowing:

| Package | Licence | Note |
|---|---|---|
| psycopg2-binary | LGPL | Fine when used as a dynamically-linked library, as here. Don't vendor or modify it. |
| python-crontab (via django-celery-beat) | LGPLv3 | Same — dynamic use only. |
| certifi | MPL-2.0 | File-level copyleft; unmodified use is fine. |
| qrcode | "BSD; Other" | Metadata is ambiguous; upstream is BSD. Confirm before distributing a closed binary. |
| Pillow | MIT-CMU | Permissive. |

Nothing requires publishing Showzy's source. If you ever **distribute** the backend (rather than host it), have counsel re-check the LGPL items.

## Housekeeping findings

- **Two DOM test environments** are installed (`jsdom` and `happy-dom`). Keep one — fewer packages, smaller attack surface.
- Several packages are behind on **minor** versions but not vulnerable (celery 5.4 → 5.6, sentry-sdk 2.19 → 2.71, gunicorn 23 → 26, whitenoise 6.8 → 6.12, boto3). Schedule a quarterly bump.
- Major frontend upgrades are available (React 19, Vite 8, Vitest 5, TypeScript 7, `lucide-react` 1.x, `motion` 14). None is security-driven; adopt deliberately.
- `psycopg2-binary` is fine for development; for production the psycopg docs recommend building `psycopg2` (or moving to `psycopg` 3) rather than shipping the bundled wheel.

## Keep it clean — recommended automation

1. **CI step:** `npm audit --audit-level=high` and `pip-audit -r apps/backend/requirements.txt` on every pull request; fail on high.
2. **Dependabot / Renovate** for both ecosystems (weekly), grouped by minor/patch.
3. **SBOM:** generate with `cyclonedx-py` (Python) and `@cyclonedx/cyclonedx-npm` and attach to each release — useful for the grievance/Data-Protection-Board conversation and for enterprise venue customers.
4. **Pin and review** anything that touches uploads (Pillow), tokens (simplejwt, cryptography) or the public server (daphne, twisted) within a week of a security release.

## How to reproduce

```bash
# frontend
npm audit --workspace apps/frontend
# backend
cd apps/backend && .venv/bin/python -m pip install pip-audit pip-licenses
.venv/bin/python -m pip_audit -r requirements.txt
.venv/bin/python -m piplicenses --format=markdown
```
