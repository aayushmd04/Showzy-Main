# Consent audit — every place Naada asks for, or relies on, an agreement

*11 Oct 2026. Framework: India's Digital Personal Data Protection Act, 2023 (notice, free/specific/unambiguous consent, ability to withdraw, record-keeping), plus the Consumer Protection (E-Commerce) Rules, 2020 and the IT Act. This is an engineering review, not legal advice — see the lawyer checklist in [README.md](README.md).*

**Principles applied**

1. **Notice before collection**, in plain words, with a link to the full policy.
2. **No pre-ticked boxes**; consent is an action.
3. **Specific:** one purpose per checkbox; marketing never bundled with terms.
4. **As easy to withdraw as to give** (Settings → Privacy & consent, Cookie settings in the footer).
5. **Provable:** an append-only log (`users.ConsentRecord`: kind, document version, granted/withdrawn, source, time).

## Findings and fixes

| # | Where | Data collected | Before | After | Status |
|---|---|---|---|---|---|
| 1 | **Sign-in** (email → code) | Email, IP/browser of the request | **No notice at all.** Terms and Privacy weren't mentioned at the point accounts are created. | Notice under the email box: *"By continuing you agree to our Terms and Privacy Policy. We only use your email to sign you in and send your tickets."* Links open in a new tab. Acceptance is logged as `terms_privacy` with the document version after the code is verified. | ✅ Fixed |
| 2 | **Host onboarding** (venue) | Name, venue, address, capacity | Nothing — and "authorised to list this venue" was never asked. | Required checkbox: authorised to list the venue; agree to host Terms (responsibility for events, floor plan, invitees; KYC before payout). Logged as `organiser_terms`. | ✅ Fixed |
| 3 | **Artist onboarding** | Name, stage name, city, genres, bio | Nothing about escrow, KYC or profile visibility to hosts. | Required checkbox covering artist Terms, escrow, KYC, and that hosts see the profile. Logged as `organiser_terms`. | ✅ Fixed |
| 4 | **Guest checkout details** | Name, phone, email | Checkbox said only "storing these details to issue and verify my ticket"; **did not say they are shared with the organiser**, which the Privacy Policy says they are. | Wording now includes sharing name and contact with the organiser *of that event*, and why. Logged as `ticket_contact` when an account exists. | ✅ Fixed |
| 5 | **Signed-in checkout** (skips the details step) | Name/email from the account | The organiser-sharing disclosure was never shown to anyone who was already signed in. | One-line notice on the payment page: Terms + Refund policy agreed by paying; organiser sees name and ticket details. | ✅ Fixed |
| 6 | **Settings → email notifications** | Preferences | Toggles existed, defaults sensible (marketing **off**), but changes weren't recorded. | Turning *What's on in your city* on/off writes a `marketing_email` consent row. | ✅ Fixed |
| 7 | **Gate-team invite** (a host types **someone else's** email/phone) | Third party's contact | No notice to the host; the stranger's contact was kept forever, even after the invite was declined or withdrawn. | Notice to the host ("only invite people who know you're asking…"). The email/phone is **blanked on decline or cancel**; erased with the invitee's account. Terms (§5, §6) bind hosts and gatekeepers. | ✅ Fixed |
| 8 | **Ticket transfer** (sender types a friend's email) | Third party's email | No explanation. | Dialog says the email is used only to find their account and that ticket details pass to them. | ✅ Fixed |
| 9 | **Cookies / local storage** | Preferences, tokens | **No notice, no choice;** Google Fonts sent visitor IPs to Google on every page. | Cookie banner (Accept / Reject / Choose — equal prominence), preferences panel, footer "Cookie settings", Cookie Policy listing every item; fonts self-hosted. Language/theme persist **only with consent**. | ✅ Fixed |
| 10 | **Privacy Policy** | — | Existed but omitted gate teams, seats, KYC data, children, retention periods, recipients, DPDP rights mechanics. | Rewritten to match what the product does (tables for purposes, recipients, retention). | ✅ Fixed — needs legal review |
| 11 | **Refund policy** | — | Said tickets are **non-refundable** while the app lets guests cancel and refunds the ticket price (>24 h). Contradiction = consumer-law risk. | Rewritten to the real rules. | ✅ Fixed |
| 12 | **Terms** | — | No seating/hold rules, no gatekeeper or children terms, no content licence. | Added. | ✅ Fixed — needs legal review |
| 13 | **Account deletion** | — | One button + typing DELETE; no re-authentication; no warning about losing tickets; **ticket holder name/email/phone and IP logs survived "erasure"**; hosts could delete while events were live. | Guided flow with pre-checks, emailed code, full erasure service — see [DATA-MAP.md](DATA-MAP.md). | ✅ Fixed |
| 14 | **Data export** | — | Covered tickets, orders and saved events only. | Adds profile, reviews, notifications, gate duty, artist/venue records, devices, e-mail preferences and the consent log. | ✅ Fixed |
| 15 | **Sign-out on shared devices** | — | Cached ticket list and a floor-plan draft stayed in the browser for the next user (and the draft could appear in another account's editor). | Cleared on sign-out and deletion. | ✅ Fixed |

## Still open (decisions or work for you)

| # | Item | Why it matters | Suggested action |
|---|---|---|---|
| A | **Phone numbers are not verified.** Gate invites by phone match `User.phone`, which anyone can set. | Someone could register a number they don't own and accept an invite meant for it. | Verify phone by OTP before it can be used for invites, or disable phone invites. (Email invites are safe — email is verified at sign-in.) |
| B | **Existing users never saw the new notice.** Consent rows exist only for sign-ins after this change. | Under the Act you should be able to show consent for each active user. | On next sign-in the log fills automatically (it records each login). For dormant users, email the updated policies and keep the date. |
| C | **No re-consent prompt on a policy change.** | A material change should ask again. | Compare the user's latest `terms_privacy` version with `LEGAL_VERSION` and show a one-time "We've updated our terms" sheet. |
| D | **KYC data (PAN, GST, bank) has no on-form notice** explaining use/retention. | Sensitive financial data. | Add a short purpose line above the form on *Business* and the artist profile; link to the Privacy Policy. |
| E | **Children / baby chairs.** We record a number only, no child data. | Verifiable parental consent (s.9) applies if child data is ever collected. | Keep it a count; never add a child's name/age without a parental-consent flow. |
| F | **Retention is policy, not code.** | "Up to 8 years" and "no longer than needed" aren't enforced by a job. | Scheduled task: purge `EventView`/old OTP rows (e.g. > 90 days); anonymise dormant accounts. |
| G | **Grievance and DPO details are placeholders** until the env vars are set (the pages show a red "Not ready to publish" banner by design). | The E-Commerce Rules and the Act require published contact details. | Set `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `GRIEVANCE_OFFICER`, `POLICIES_UPDATED`. |
| H | **Breach process** is described in the policy but there is no runbook. | 72-hour-style notification to the Board and affected users. | Write a one-page incident runbook and name an owner. |
| I | **Significant Data Fiduciary / DPIA.** | Large volumes or sensitive data can trigger extra duties. | Have counsel assess once volume grows; keep this folder as the starting dossier. |

## How consent is stored

`ConsentRecord(user, kind, version, granted, source, created_at)` — append-only; the newest row per `kind` is the current position. Kinds: `terms_privacy`, `organiser_terms`, `marketing_email`, `ticket_contact`. Cookie choices are kept in the first-party cookie `naada_consent` (12 months) and are re-asked when `CONSENT_VERSION` changes. After erasure the user row remains (de-identified) so the log still proves what was agreed.

API: `GET/POST /api/v1/auth/consents/`. Tests: `apps/users/test_privacy.py`, `src/lib/consent.test.ts`, `src/components/naada/cookie-consent.test.tsx`.
