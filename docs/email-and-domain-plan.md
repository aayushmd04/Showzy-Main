# Showzy email + domain plan (showzy.in → Cloudflare)

Status: plan only, nothing implemented. Written 2026-10-18 against `Showzy-Main` @ `897b19f`.
Target from `TODO.md`: working product first week of December 2026, so about 6–7 weeks.

---

## 0. What the repo already does (so we don't rebuild it)

Email OTP sign-in **already exists**. This is a migration and hardening job, not a new feature.

| Area | Today | File |
|---|---|---|
| Request code | `POST /auth/request-otp/`, 6 digits, 10 min expiry, 5 attempts, per-IP **and** per-email throttle (5/hour each) | `apps/users/views.py:68`, `naada/settings/base.py:172,288` |
| Verify code | `POST /auth/verify-otp/`, atomic attempt counter, creates the user on first verify, issues JWT | `apps/users/views.py:121`, `apps/users/models.py:83` |
| Sending | Django `send_mail`, **synchronously inside the request**, SMTP (Gmail default) or console fallback | `base.py:228`, `apps/core/checks.py:45` |
| Prod safety | `OTP_DEBUG_RESPONSE` forced `False` in production; deploy check warns if console backend is active | `settings/production.py:52` |
| Notifications | `apps/notifications/dispatch.py` already sends: ticket confirmation, refund, offer made/answered, gig decision, event cancelled/changed. Per-type opt-outs in `NotificationPreference` | `apps/notifications/` |
| Not wired | `NEW_MESSAGE` type exists but **chat sends no notification**; `WELCOME`, `TICKET_TRANSFER_RECEIVED`, `OTP_SENT`, `EVENT_REMINDER` types exist with no sender | `apps/chat/views.py:49`, `apps/chat/consumers.py:90` |
| Brand | Defaults still say `noreply@naada.live` | `base.py:235`, `.env.example:63,96` |
| Hosting | Render (`render.yaml`) or an Oracle VM (`deploy/oracle`); Django is **not** on Cloudflare Workers | `DEPLOY.md` |

### Gaps in the current OTP flow (fix during this work)

1. **Code is generated with `random`, not `secrets`** (`models.py:113`). Not cryptographically secure.
2. **Codes are stored as plain SHA-256** (`models.py:117`). With 10⁶ possible values, anyone who reads the table can reverse every live code instantly. Use `HMAC-SHA256(code, server pepper)` + `hmac.compare_digest`.
3. **Client IP is spoofable.** `get_client_ip` trusts the first `X-Forwarded-For` value (`views.py:61`). An attacker can send a fresh fake IP per request and walk past the per-IP throttle. Behind Cloudflare, read `CF-Connecting-IP` and only trust it when the request came through Cloudflare.
4. **`verify-otp` has no throttle of its own** beyond the generic 600/hour anon write limit. Per-token attempts are capped, but an attacker can request a new code and try again. Add a per-IP and per-email verify throttle.
5. **Anyone can lock a victim out.** Requesting a code invalidates the previous one, and 5 requests/hour per email is the cap. An attacker can spend that budget on a victim's address so the victim cannot sign in. Mitigated by Turnstile + a short resend cooldown rather than by raising limits.
6. **Email is sent in the request thread.** A slow or failing provider makes sign-in slow or a 500. Move to a Celery task with retry.
7. **No resend cooldown, no expired-token cleanup.** `OTPToken` rows are never deleted.
8. **Expiry is 10 min** (`OTP_EXPIRY_MINUTES`); you want 2–3.

---

## 1. Decisions to confirm before starting

These change the plan. My default is in bold.

1. **Which GoDaddy "mail" is it? OPEN: you aren't sure which product.** First thing to do is identify it (§3, step 0). I'm assuming a **GoDaddy mailbox** (Microsoft 365 or GoDaddy Workspace/Titan, e.g. `hello@showzy.in`) that humans read. Plan: **keep it as the human inbox** and make it the `Reply-To`, `support@`, and DMARC report address. If instead you meant "send app mail through GoDaddy SMTP", tell me. I'd advise against it (low send limits, poor transactional deliverability).
2. **Domain transfer vs nameserver change.** **Move DNS to Cloudflare by changing nameservers; leave the registrar at GoDaddy.** See §3 for why.
3. **Provider risk. DECIDED: Cloudflare only for now.** Email **Sending is in beta**, so sign-in depends on one beta service. Accepted. Mitigation that costs almost nothing: keep the `EMAIL_PROVIDER` seam (§5, Phase A) so a second backend can be dropped in later, and keep the Django console backend selectable for local development. No standby account, failover class or failover drill is part of this plan. Revisit if Cloudflare has an incident or before a big sales window.
4. **OTP expiry.** **3 minutes** is workable if sending is fast, there's a visible countdown, and Resend is one tap. Keep the setting configurable; if support sees "code expired" complaints, go to 5.
5. **Chat emails.** **Digest/debounced, never one-email-per-message** (see §8).

---

## 2. Target architecture

```
 Browser ──► Cloudflare (DNS, optional proxy/WAF) ──► Django API (Render / Oracle)
                                                          │
                      request-otp: validate + Turnstile + throttles
                                                          │ enqueue
                                                    Celery worker (Redis)
                                                          │ HTTPS 443
                                      Cloudflare Email Sending REST API
                                                          │
                                         recipient inbox (Gmail, Outlook…)
                                                          │
                       delivered / bounced / complained events
                                                          ▼
                         Cloudflare Queue → signed webhook → Django `EmailEvent`
                                                          ▼
                                   Admin email dashboard + alerts
```

- **Django → Cloudflare over the REST API** (`POST /accounts/{id}/email/sending/send`, Bearer token). The Workers `send_email` binding is not available because Django doesn't run on Workers.
- SMTP also works (`smtp.mx.cloudflare.net:465`, implicit TLS only, user `api_token`, password = token). It needs no custom code, but Django here is configured for STARTTLS on 587 (`EMAIL_USE_TLS`), and a PaaS may block outbound SMTP ports (Render's free tier does, as far as I know; verify). **REST over 443 avoids both problems**, so it's the primary path.
- Email Routing (inbound) is a separate, optional feature. **Do not enable it on the apex** while a GoDaddy mailbox is in use: it replaces the MX records and the mailbox stops receiving.

---

## 3. Domain: GoDaddy → Cloudflare

**Registrar transfer is probably not possible, and not needed.** Cloudflare's published TLD list does not include `.in` (checked 2026-10-18; Cloudflare says it is expanding country-code TLDs, so confirm in the dashboard under Domain Registration → Transfer). Separately, ICANN's 60-day rule blocks transfers soon after a new registration. Cloudflare Email Service only requires that the domain **uses Cloudflare DNS**, which a nameserver change gives you for free.

### Steps (you, with me checking the records)

0. **Identify the mail product.** GoDaddy dashboard → Products → look under "Email & Office". "Microsoft 365 Email" means Microsoft; "Professional Email" / "Workspace Email" means Titan. The MX records tell you too: `*.mail.protection.outlook.com` is Microsoft 365, `mx1.titan.email` / `mx2.titan.email` is Titan, `*.secureserver.net` is GoDaddy's older Workspace. Send me the MX and TXT (SPF) records and I'll confirm what to preserve.
1. **Export the GoDaddy zone.** DNS → Manage → export/copy every record. Screenshot the MX, SPF (TXT), DKIM (CNAMEs such as `selector1._domainkey`), `autodiscover`, and any `_dmarc` records. These are what keep the GoDaddy mailbox working.
2. **Turn on 2FA on the GoDaddy account** (it holds the domain). Enable **domain lock**. If DNSSEC is enabled at GoDaddy, **remove the DS record before** changing nameservers, or the domain goes dark.
3. **Add `showzy.in` to Cloudflare (Free plan).** Let it scan, then **diff against your export** and add anything missing by hand. The scan misses records.
4. **Set the mailbox records to "DNS only" (grey cloud).** Proxying breaks mail records. Keep website records proxied only if you want WAF.
5. **Lower TTLs** on the GoDaddy side a day before the switch.
6. **Change nameservers at GoDaddy** to the two Cloudflare ones. Wait for "Active" (minutes to 24 h).
7. **Verify the mailbox still works:** send to and from it, check `dig MX showzy.in`, `dig TXT showzy.in`.
8. **Re-enable DNSSEC in Cloudflare** and add the DS record at GoDaddy (optional but recommended).
9. **Lock down the Cloudflare account:** 2FA (prefer a hardware key), minimal members, API tokens scoped, not the Global API key.

### Why this matters beyond email
With passwordless sign-in, **whoever controls the domain's DNS or mailboxes controls every user account** (they can redirect mail or reset anything). The registrar and Cloudflare logins are the real crown jewels. Treat 2FA and the lock as release blockers.

### DNS records to end up with

| Host | Type | Purpose | Source |
|---|---|---|---|
| `showzy.in` | MX / TXT SPF / CNAME DKIM | GoDaddy mailbox (human inbox) | **copy from GoDaddy, unchanged** |
| `mail.showzy.in` | MX (`cf-bounce.*`), TXT SPF, TXT DKIM | Cloudflare Email Sending (transactional) | auto-added when you onboard the subdomain |
| `_dmarc.showzy.in` | TXT | DMARC policy + report address | you set it (§6) |
| `_mta-sts`, `mta-sts`, `_smtp._tls` | TXT / CNAME | TLS enforcement and reports | later (§6) |
| `app.` / `api.` | A / CNAME | the product itself | with deploy work |

**Send from a subdomain (`mail.showzy.in`), not the apex.** The apex SPF can hold only one record and already belongs to GoDaddy's mailbox; a subdomain avoids merging and keeps a transactional-reputation problem from touching the human inbox. Cloudflare onboards each sending domain separately and recommends a subdomain.

---

## 4. Cloudflare Email Sending setup

Facts as of 2026-10-18 from Cloudflare's docs; re-check before buying anything.

- Requires the **Workers Paid plan** (about $5/month). **3,000 emails/month included, then $0.35 per 1,000.** Sends to verified destination addresses are free.
- **New accounts start with a low daily quota** that grows with good sending behaviour. File the **limit-increase form before launch**; New Year ticket sales are the spike.
- Limits: 50 recipients/message, 5 MiB message. Irrelevant to us, but our code will enforce **1 recipient** anyway (§5).
- Suppression list built in: bounced and complained addresses are blocked and don't count toward quota.

### Steps

1. Upgrade to Workers Paid. Put a spend alert on the account.
2. Dashboard → Compute → **Email Service → Email Sending → Onboard Domain** → `mail.showzy.in`. Review the MX/SPF/DKIM/DMARC records it adds, then confirm.
3. Wait for DNS to verify (typically 5–15 min).
4. **Create a scoped API token**: account-owned, permission **Email Sending: Edit** only, nothing else. One for staging, one for production. Restrict to your server IPs if they're static.
5. While staging: before the domain is onboarded you can send only to **verified destination addresses**. That's useful for free end-to-end tests.
6. Sender identities (all `@mail.showzy.in`): `no-reply` (OTP, tickets), `notify` (chat/booking), `security` (account alerts). `Reply-To: support@showzy.in` (the GoDaddy mailbox).
7. Also create and **monitor** `postmaster@`, `abuse@`, `support@`, `security@showzy.in` as real addresses or aliases on the GoDaddy mailbox. Receivers expect `postmaster`/`abuse` to exist.

---

## 5. Backend work (phased)

### Phase A: provider plumbing (about 1–2 days)
- `apps/core/email_backends.py`: `CloudflareEmailBackend(BaseEmailBackend)` that POSTs to the REST API with `requests`/`httpx` (timeout 5 s, no redirects, raise on non-2xx; REST `from` uses `address`, `reply_to` is snake_case). No failover class (decision: Cloudflare only).
- `base.py`: new `EMAIL_PROVIDER` (`console` | `cloudflare`), `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_EMAIL_TOKEN`; keep `EMAIL_PORT` safe-default behaviour (blank int crashes boot, see the `render.yaml` comment). Add `EMAIL_USE_SSL` support if SMTP is ever used.
- `DEFAULT_FROM_EMAIL=Showzy <no-reply@mail.showzy.in>`, `EMAIL_REPLY_TO=support@showzy.in`. Replace `naada.live` defaults in `base.py`, `.env.example`, `render.yaml`, `deploy/oracle/.env.example`.
- Make `apps/core/checks.py` (`naada.W002`) an **error**, not a warning, in production: boot refuses if the backend is console/dummy. Printing OTPs to production logs is both a lockout and a leak.
- Update `compliance/DATA-MAP.md` and `THIRD-PARTY-AUDIT.md`: Cloudflare becomes a processor of email addresses and message metadata (DPDP Act 2023 paper trail).

### Phase B: OTP hardening (about 2–3 days)

**Status 2026-10-18: backend half done on branch `feat/otp-hardening` (uncommitted), 320 backend tests pass.** Done: `secrets` codes; HMAC-SHA256 storage bound to address+purpose (`OTP_PEPPER`); 3-minute default expiry; 45 s resend cooldown (429 + `Retry-After`); hourly + daily per-address caps and per-IP cap; verify throttles per IP and per address; trusted client IP (`apps/core/net.py`, `TRUSTED_PROXY_COUNT` / `CLIENT_IP_HEADER`); failed send returns 503 and drops the token; daily purge task; `expires_in` / `resend_after` in the response. **Not done:** Turnstile, global circuit-breaker, frontend countdown/resend UI, disposable-domain blocklist.

**Correction to the plan below:** the OTP email is sent **inline**, not through Celery. A queued task would have to carry the plain code through Redis and worker logs. `EMAIL_TIMEOUT` (8 s) bounds the wait instead; Celery is for the non-secret notifications in Phase C.

- `secrets.choice`/`secrets.randbelow` for codes; store `HMAC-SHA256(pepper, email|purpose|code)` (pepper = new env secret, not `SECRET_KEY` itself); compare with `hmac.compare_digest`. Migration invalidates all live codes (fine; they're minutes old).
- `OTP_EXPIRY_MINUTES=3`; email copy says "3 minutes"; frontend countdown reads `expires_in` from the API instead of hard-coding.
- **Resend cooldown**: server returns `429` with `retry_after`; default 45 s between sends to one address.
- Budgets: per address **5/hour and 10/day**, per IP **10/hour**, **global circuit-breaker** (e.g. >300 OTP sends in 5 min → stop, page you). The global breaker is what stops a distributed attack from burning your Cloudflare quota and reputation.
- **Verify throttles:** per IP 20/hour and per email 10/hour; after 5 failed tokens in an hour for one address, lock it for 15 min.
- **Cloudflare Turnstile** on request-otp, verified server-side with `siteverify` before any code is created or mail sent (there's a `turnstile-spin` skill that does the wiring end to end). This is the single best anti-bombing control. Use managed (invisible) mode so real users rarely see a challenge.
- Real client IP: trust `CF-Connecting-IP` only when the request arrives via Cloudflare (origin allow-list or Tunnel, §7); otherwise use the socket address. Remove the blind `X-Forwarded-For[0]`.
- Email hygiene: lowercase + strip; reject addresses with control chars; optional disposable-domain blocklist; optional MX lookup on the domain at request time (cached). Keep the response identical whether or not the account exists (already true).
- ~~Move sending to a Celery task~~ superseded by the correction above: inline send with a timeout and a clean 503. Same hardening applied to `request_deletion_code`.
- Daily Celery beat job: delete `OTPToken` older than 1 day.
- Tests (extend `apps/users/tests.py`, which already has `OTPThrottleTests`): expiry at 3 min, cooldown, constant-time compare path, HMAC migration, spoofed `X-Forwarded-For` ignored, verify throttle, Turnstile failure sends nothing, nothing sent to a suppressed address.

### Phase C: a single send path for everything else (about 2 days)
`dispatch.send_email` becomes the **only** way mail leaves the app:
- **One recipient per call**, subject/header newline rejection, size cap.
- **`EmailLog` model**: `kind`, `user` (nullable), `to_hash` (not the plain address), `provider_message_id`, `status`, `created_at`, `idempotency_key` (unique, e.g. `ticket_confirmed:<order_id>`). Never store the OTP or message body.
- Idempotency: the order-confirm path already sends once (`payments/views.py:88-108` only emails on the call that confirmed). Keep that, and add the unique `idempotency_key` so the same guarantee holds once sending moves to Celery, where a task retry could otherwise double-send.
- Run via Celery, with retry/backoff, so a payment response never waits on email.
- Check suppression locally before sending; respect `NotificationPreference`.
- Shared HTML + text template with Showzy branding, both parts always (text-only part helps spam scoring).

---

## 6. Spam-proofing and deliverability

**Authentication**
- SPF + DKIM on `mail.showzy.in` come with onboarding. Confirm **alignment**: the visible From domain must match the DKIM `d=` / SPF domain, or DMARC fails.
- **DMARC rollout:** start `v=DMARC1; p=none; rua=mailto:dmarc@showzy.in` for 2 weeks, read the reports, fix anything unexpected, then `p=quarantine`, then `p=reject`. Protect the **apex** with the same ramp (spoofing `@showzy.in` is the phishing risk for your users). Cloudflare offers DMARC reporting in the dashboard (check availability); otherwise a free DMARC report reader works.
- **MTA-STS** (Cloudflare has a configuration page) + **TLS-RPT** once the basics are green.
- Optional later: BIMI (needs a VMC, not worth it yet).

**Content rules for OTP mail**
- **No links, no images, no tracking pixels, no click-tracking.** A bare code in a plain, short message is the best-delivered and hardest-to-phish format.
- Code **not** in the subject (already true); stable subject, e.g. `Your Showzy sign-in code`.
- Say who it's from, that it expires in 3 minutes, and "Showzy will never ask for this code".
- Send as `Reply-To: support@showzy.in` so replies reach a human.

**Reputation**
- Transactional only on `mail.showzy.in`. If you later want marketing or digests, use a **different subdomain** (`news.showzy.in`) so a spam complaint can't hurt OTP delivery. Cloudflare's service is transactional-only anyway.
- Stop sending to hard-bounced and complained addresses (Cloudflare's suppression list does; mirror it in `EmailEvent`).
- Warm-up is slow by default (low daily quota); don't blast the first week.
- Register with **Google Postmaster Tools** and Microsoft SNDS for the domain. Gmail dominates in India; keep complaint rate under 0.1%.
- Test before launch: mail-tester.com score ≥ 9/10, and "Show original" in Gmail must show `SPF: PASS`, `DKIM: PASS`, `DMARC: PASS`. Test Gmail, Outlook, Yahoo, and one Indian ISP/Zoho address.

---

## 7. Security: "shared only to necessary mail, no breach"

**Least privilege**
- API token: one permission (Email Sending: Edit), account-owned, separate per environment, stored only in the host's secret store (never in git, never in `.env.example`), rotated quarterly and **immediately** if anyone leaves.
- Recipient rules in code: OTP goes only to the address that requested it; no CC/BCC to staff; no user address ever appears in another user's email or UI.
- Internal mail (security/abuse/dmarc) lands on aliases of the GoDaddy mailbox that a minimum number of people can read.

**Attack surface**
- **Origin lock-down (API is on Render, DECIDED):** Render can't IP-restrict a web service and has no Tunnel, so: proxy `api.showzy.in` through Cloudflare (orange cloud) and have a **Cloudflare Transform Rule add a secret header** (e.g. `X-Origin-Auth: <random>`) to every proxied request; Django middleware rejects any request without it with 403 (constant-time compare, secret in Render env, rotatable). Only requests carrying the header are trusted to have an honest `CF-Connecting-IP`. Also set `ALLOWED_HOSTS` to the custom hostname and drop the `onrender.com` hostname, so the raw Render URL can't bypass the edge. Needs the Render custom domain and Cloudflare "Full (strict)" TLS.
- **Cloudflare rate-limit rule** on `POST /api/v1/auth/request-otp/` and `/verify-otp/` as a front line before Django's throttles.
- Webhook endpoint for email events: HMAC-signed with a timestamp, replay-protected, no other auth path.
- Sentry already scrubs PII (`production.py:137`); also make sure `EmailLog` and Celery args never contain codes.
- Keep `OTP_DEBUG_RESPONSE` impossible in production (already hard-set); add a test that asserts it.
- Secrets in CI: scoped to the deploy job only.

**Account-takeover paths to close** (because mail *is* the login)
1. Registrar/DNS control → 2FA + lock + DNSSEC (§3).
2. User's own mailbox → can't fix, but show "new sign-in" security emails (`security@`) for first-time device/IP so a victim learns of a takeover.
3. Email provider outage → no failover (decision: Cloudflare only). Make the failure visible: the sign-in screen must say "we couldn't send the code, try again shortly", and the §9 alert on OTP delivery rate must page you.

---

## 8. Future mail features (design now, build after OTP lands)

| Feature | Trigger | Rules |
|---|---|---|
| **Ticket confirmation** | Order confirmed (exists) | Idempotent per order; Celery; include ticket list + link, no QR attachment initially |
| Refund / event cancelled / changed | exists | Fan-out as batched Celery tasks with a per-send rate (cancelling a 2,000-ticket event must not hit quota in one burst) |
| **Welcome** | First verify (`is_new_user`) | One only; unused type exists |
| Ticket transfer received | Transfer completes | Notify recipient; unused type exists |
| Event reminder | Beat job, `event_reminder_hours_before` pref exists | Opt-in default is on today, review under DPDP consent |
| **Chat: venue ↔ artist** | New `Message` while recipient has no live socket | **Debounce:** email only if the message is still unread after ~10 min, **max 1 email per conversation per hour** and ~5/day per user, collapse N messages into one digest. New `new_message_email` preference (only `new_message_push` exists). Hook both `chat/views.py:49` and `chat/consumers.py:90`. Show sender's display name and a short preview or none; **never** the other party's email address. `Reply-To` support, not the counterparty (no address leak). Later: inbound replies through Email Routing → Worker using signed `reply+<token>@mail.showzy.in` addresses. |
| Booking offers | exists | Keep, already preference-gated |
| Admin/ops alerts | Bounce spike, quota near limit | To you, via Slack or email |

**Bombing guards for all of the above:** per-user daily cap, per-type cap, global send budget with an alert at 70% and a hard stop at 95% of the daily quota (OTP gets a **reserved slice** so a notification burst can't starve sign-in).
Marketing/digest mail, if ever added, needs `List-Unsubscribe` + one-click (RFC 8058) headers and a signed-token preference page; transactional mail doesn't, but chat digests should.

---

## 9. Analytics dashboard

**What you get from Cloudflare for free:** Dashboard → Compute → Email Service → Email Sending → **Analytics** (per domain or account), plus an **Activity log**. Datasets are also queryable by GraphQL (`emailSendingAdaptiveGroups`, `emailSendingAdaptive`; dimensions include status, event type, SPF/DKIM/DMARC result, spam flag, error cause; needs an Analytics Read token). **Retention is 31 days**, which is the reason to keep your own copy.

**Event feed:** subscribe the sending domain to Cloudflare **Queues** for `message.delivered / deferred / bounced / failed / rejected / complained`. A small Worker consumer (or an HTTP pull consumer from Celery beat) forwards each event to a signed Django endpoint that writes `EmailEvent` and updates `EmailLog.status`.

**Showzy admin page** (in the existing admin console), built on your own tables, so it survives the 31 days:
- Sent / delivered / bounced / complained, by kind and by day
- **OTP funnel:** requested → delivered → verified (this one is available *today* from `OTPToken.created_at` vs `is_used`), median time-to-verify, expired-unused %, throttled count
- Bounce and complaint rate with a red threshold
- Quota used vs daily limit, suppression list size
- Top throttled IPs/emails (hashed) for abuse spotting

**Alerts:** bounce rate > 2%, any complaint spike, OTP delivery rate < 95% over 15 min, quota > 70%.

---

## 10. Frontend work (`apps/frontend/src/components/naada/auth-sheet.tsx`)

- Turnstile widget on the email step; send its token with `request-otp`.
- Code step: **countdown from `expires_in`**, "Resend" disabled until `retry_after`, clear "code expired, send a new one" state.
- `autocomplete="one-time-code"` and `inputMode="numeric"` on the code field (auto-fill from mail apps).
- 429 handling: friendly "too many tries, try again in N minutes", never a raw error.
- Copy: "We've sent a code to **a\*\*\*@gmail.com**. It expires in 3 minutes. Check spam if you can't see it."
- Notification preferences screen: add the chat-email toggle.

---

## 11. Rollout, in order

| Week | Work | Gate to move on |
|---|---|---|
| 1 | §3 DNS to Cloudflare, mailbox verified, 2FA/locks; §4 Workers Paid, onboard `mail.showzy.in`, token; start DMARC `p=none`; file quota-increase request | Mailbox works; SPF/DKIM/DMARC pass on a test send |
| 2 | Phase A + B on a branch; staging sends to verified addresses | All new tests green (`npm run backend:test`), manual OTP flow on staging |
| 3 | Turnstile, throttles, circuit-breaker; Celery send path; frontend countdown/resend | Load test: 200 OTP requests from rotating IPs are throttled, sends stay under budget |
| 4 | Phase C (`EmailLog`, idempotency); event feed + admin analytics page | Dashboard shows a real send → delivered |
| 5 | Production cutover: new env vars, `DMARC p=quarantine`, Postmaster Tools, deliverability tests; keep console fallback **off** | mail-tester ≥ 9; Gmail/Outlook/Yahoo inbox placement |
| 6 | Chat digest + welcome + transfer mail | Caps verified with a flood test |
| 7 | `p=reject`, MTA-STS; outage drill (revoke the staging token, confirm the sign-in screen shows the "couldn't send" message and the alert fires) | Drill passes |

### Rollback
There is no standby provider. For a bad release, redeploy the previous Render build. DNS changes are reversible by pointing nameservers back to GoDaddy (keep the exported zone).

### Pre-launch checklist
- [ ] GoDaddy and Cloudflare 2FA on, domain lock on, DNSSEC decision made
- [ ] Mailbox still receives and sends after the nameserver change
- [ ] SPF/DKIM/DMARC all PASS in Gmail "Show original"
- [ ] API token scoped to Email Sending: Edit only, in secret store, not in git
- [ ] `OTP_DEBUG_RESPONSE=False` and console backend refused in production
- [ ] OTP expiry 3 min, cooldown, per-email/IP/global throttles, Turnstile, verified by tests
- [ ] Quota-increase request approved; spend alert set
- [ ] `EmailLog`/events flowing; bounce/complaint alerts firing in a test
- [ ] `compliance/DATA-MAP.md` and `THIRD-PARTY-AUDIT.md` updated; privacy policy lists the email processor
- [ ] Outage drill done (sign-in screen message + alert)
- [ ] Render origin-auth header rule live; raw `onrender.com` host rejected

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Cloudflare Email Sending is **beta** and is the only provider (accepted) | `EMAIL_PROVIDER` seam, OTP-delivery alert, clear error on the sign-in screen; revisit before big sales windows |
| Low initial daily quota; New Year spike | Quota request in week 1; OTP reserved slice; stagger notification fan-out |
| Nameserver change breaks the GoDaddy mailbox | Zone export, diff, grey-cloud mail records, verify before announcing |
| Spoofing of `@showzy.in` | DMARC ramp to `reject` on apex and subdomain |
| OTP bombing (victim spam, quota burn, reputation) | Turnstile, cooldown, per-address/IP/global limits, edge rate limit |
| Account lock-out by an attacker burning a victim's budget | Turnstile + cooldown; limits are per address *and* IP; support override path |
| 3-minute expiry too short with slow mail | Fast REST send, Celery retry, visible resend; setting is configurable |
| Mail provider/DNS account takeover | 2FA/hardware key, locks, scoped tokens, audit logs |
| Chat email floods or leaks addresses | Debounce + caps; show names only; Reply-To support |

---

## 13. Decisions log and what's still open

| # | Question | Answer (2026-10-18) |
|---|---|---|
| 1 | GoDaddy mail product | **Open.** Not sure. Do §3 step 0 and send me the MX/TXT records |
| 2 | Standby provider | **Cloudflare only** |
| 3 | API hosting | **Render** (origin lock-down by secret header, §7) |
| 4 | Frontend hosting | **Cloudflare Pages** (see note below) |
| 5 | Workers Paid (about $5/month + usage) | **Open.** Needed for Email Sending; confirm before onboarding |

Frontend on Cloudflare Pages: `app.showzy.in` (and optionally the apex) becomes a Pages custom domain, so `vercel.json` and `apps/frontend/nginx.conf` are unused in production. Pages needs a `_redirects` file (`/* /index.html 200`) for the SPA fallback, and `VITE_API_BASE` (`https://api.showzy.in/api/v1`) must be set in the Pages build settings because Vite bakes it in at build time. Both the site and the API then live in the same Cloudflare zone.

Remember to update `CORS_ALLOWED_ORIGINS`, `CSRF_TRUSTED_ORIGINS`, `ALLOWED_HOSTS` and `FRONTEND_URL`; they all still default to `naada.live` or localhost.
