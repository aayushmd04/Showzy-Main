# Compliance dossier

Everything needed to explain — to a user, a payment gateway, a venue customer or a regulator — how Showzy handles personal data. Written from the code as it stands on 11 Oct 2026.

| File | What it answers |
|---|---|
| [CONSENT-AUDIT.md](CONSENT-AUDIT.md) | Where do we ask for agreement, was it adequate, what changed, what is still open? |
| [DATA-MAP.md](DATA-MAP.md) | What personal data exists, where, who sees it, what deletion does to it, how long it lives. |
| [THIRD-PARTY-AUDIT.md](THIRD-PARTY-AUDIT.md) | Which libraries and services we depend on, their vulnerabilities and licences, and what was upgraded. |

User-facing documents live in the app: **/terms**, **/privacy**, **/cookies**, **/refunds**, **/contact** (`apps/frontend/src/screens/legal.tsx`), plus the cookie banner and Settings → Privacy & consent. How they look is in [../manual/10-privacy-cookies-and-deleting-your-account.md](../manual/10-privacy-cookies-and-deleting-your-account.md).

## What is done

- Terms of Service, Privacy Policy and Refund policy rewritten to match the product; **Cookie Policy** added.
- **Cookie banner** + preferences + footer link; only a necessary-cookies set plus an opt-in *Preferences* category; no third-party scripts on browse; fonts self-hosted.
- Consent captured and **logged** at sign-in, host/artist onboarding, guest checkout and marketing email.
- **Account deletion** redesigned: pre-checks, blockers, warnings, emailed code, real erasure of ticket holder details, IP logs, gate invites, reviews, chat, KYC data; sessions revoked.
- **Data export** now covers everything we hold.
- Dependency vulnerabilities **96 → 1** (backend) and **4 → 0** (frontend).

## Before you take real money — your checklist

- [ ] **Set the operator details** (the policy pages show a red "Not ready to publish" bar until you do): `LEGAL_ENTITY_NAME`, `LEGAL_ENTITY_ADDRESS`, `SUPPORT_EMAIL`, `SUPPORT_PHONE`, `GRIEVANCE_OFFICER`, `POLICIES_UPDATED` (see `apps/backend/.env.example`).
- [ ] **Have a lawyer read** Terms, Privacy, Cookies and Refunds. The text is a careful draft of the product's real behaviour, not legal advice. Points to confirm in particular: the 18+ rule, retention periods ("up to 8 years"), complaint-handling times (48 h acknowledge / 30 days resolve), the liability cap, Karnataka jurisdiction, the DPDP Rules timelines in force at launch.
- [ ] **Appoint** the grievance officer named in the policies and give them a mailbox.
- [ ] **Sign DPAs** with the payment gateway, email, hosting/database, storage and monitoring providers; note their regions.
- [ ] Decide the open items in [CONSENT-AUDIT.md](CONSENT-AUDIT.md) (A–I) — especially **A: unverified phone numbers** for gate invites.
- [ ] Add a **retention job** (purge old `EventView` and OTP rows) and an **incident runbook**.
- [ ] Wire `npm audit` and `pip-audit` into CI; plan the **Razorpay 2.x** upgrade so `setuptools` can move past 83.
- [ ] Re-run the screenshots in the manual after UI changes.

## When you change something

| If you… | Update |
|---|---|
| Add a cookie / storage key | `lib/consent.ts` categories, `/cookies` table, DATA-MAP |
| Add analytics or any third-party script | A new consent category (default **off**), `CONSENT_VERSION`, Cookie + Privacy Policy, THIRD-PARTY-AUDIT |
| Add a model that holds personal data | `privacy.erase_account`, `privacy.export_data`, DATA-MAP, a test |
| Change Terms / Privacy / Cookies in substance | `LEGAL_VERSION` (`lib/legal.ts`), `POLICIES_UPDATED`, and email users |
