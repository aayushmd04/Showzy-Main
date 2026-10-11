# Naada User Manual

Step-by-step guides for every core flow in Naada, captured from the running app.
Every screenshot has **pink numbered marks** — the numbers match the "What you're looking at" tables under each picture.

> Captured 11 Oct 2026 against the local build (dev mode: one-time codes are shown on screen, payments use the **Test payment** sheet).
> Screens marked ⚠ are described *as they work today*; the matching problem is explained in [UX-AUDIT.md](UX-AUDIT.md).

## Who is this for?

| If you are… | Start here |
|---|---|
| **Anyone** creating an account | [00 · Sign in, sign up and choosing a role](00-getting-started-sign-in-and-roles.md) |
| **A guest / fan** buying a ticket | [01 · Find an event and book a ticket](01-guest-find-and-book-a-ticket.md) |
| **A guest** managing tickets, your account | [02 · My tickets, transfer, cancel, settings](02-guest-tickets-and-account.md) |
| **A host / venue owner** setting up | [03 · Host: set up your venue and business details](03-host-set-up-venue-and-business.md) |
| **A host** designing seating | [04 · Host: floor-plan designer and guest preview](04-host-floor-plan-designer.md) |
| **A host** creating and selling an event | [05 · Host: create, publish and share an event](05-host-create-and-publish-an-event.md) |
| **A host** running the door | [06 · Host: gate team and live check-in](06-host-gate-team-and-live-check-in.md) |
| **A gatekeeper** (invited to check tickets) | [07 · Gatekeeper: accept an invite and check tickets](07-gatekeeper-guide.md) |
| **An artist** | [08 · Artist: profile, gig board, offers](08-artist-guide.md) |
| **A Naada admin** | [09 · Admin: verification and operations](09-admin-guide.md) |
| **Anyone** — privacy, cookies, consent, deleting your account | [10 · Privacy, cookies and deleting your account](10-privacy-cookies-and-deleting-your-account.md) |
| **Product / design / QA** | [UX-AUDIT.md](UX-AUDIT.md) — what feels off, why, and how to fix it |

## The four kinds of account

| Account | What it can do | Where it lives |
|---|---|---|
| **Guest** (audience) | Browse, book, manage tickets | Public site |
| **Host** (venue owner) | Venue, floor plan, events, door, bookings | `/host` console |
| **Artist** | Profile, gig board, offers, earnings | `/artist` console |
| **Admin** | KYC, disputes, ledger | `/admin` console |
| **Gatekeeper** (not a role) | Check tickets at *one* event, in a time window, after the host invites them and they accept | `/gate` — any account can be a gatekeeper |

## Conventions

- **Pink numbered circle + pink box** = the control being described.
- **Tip** = something that saves time. **Heads-up** = something that can surprise you.
- File names: `NN-audience-topic.md` for guides, `assets/<flow>-<step>-<what>.jpg` for screenshots (`auth-`, `privacy-`, `browse-`, `buy-`, `ticket-`, `account-`, `host-`, `layout-`, `gate-`, `artist-`, `admin-`, `mobile-`).

## Folder map

```
manual/
├── README.md                              ← you are here
├── 00-getting-started-sign-in-and-roles.md
├── 01-guest-find-and-book-a-ticket.md
├── 02-guest-tickets-and-account.md
├── 03-host-set-up-venue-and-business.md
├── 04-host-floor-plan-designer.md
├── 05-host-create-and-publish-an-event.md
├── 06-host-gate-team-and-live-check-in.md
├── 07-gatekeeper-guide.md
├── 08-artist-guide.md
├── 09-admin-guide.md
├── 10-privacy-cookies-and-deleting-your-account.md
├── UX-AUDIT.md                            ← findings, severity, fixes
└── assets/                                ← annotated screenshots
```
