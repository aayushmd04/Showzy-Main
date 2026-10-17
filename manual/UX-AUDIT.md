# Showzy UX audit — end-to-end, signed-in flows

*Walked through on 11 Oct 2026 against the local build, as a signed-out visitor, guest, host (new account), artist, admin and gatekeeper. Every finding below was reproduced on screen; code locations are given so a developer can go straight to it.*

## The short answer to "something feels off"

Three things, in order of how much they hurt:

1. **A host can't finish the job.** There is no way to add ticket tiers, and a venue can only be created once, during sign-up. A new host can create a draft event and then hit a wall: *"Add a ticket tier first"* — with no button. (B1, B2)
2. **The app says things that aren't true.** "Sent to your phone" (no phone, no SMS), "you can change this role later in Settings" (you can't), "Trending — the room everyone is talking about" over an empty list, a demo venue name ("The Humming Tree") on a real host's dashboard, a sample floor plan presented to guests as the host's room, and a 5% vs 7% fee statement on two screens. Each one is small; together they erode trust. (H1, H2, H7, H8, H9, M1)
3. **There's no "what next?"** None of the dashboards tell a new user what to do or what's left before they can sell, perform or get paid. The empty states are mostly good (artist pages are the best); the *first-run* is empty. (M2)

What's genuinely good, so you don't undo it: the ticket purchase flow itself (clear total, 15-minute hold, honest cancel/refund copy), the gate-team model, error messages that say what to do, the artist profile completeness meter, and the confirmation sheets that name their consequences.

---

## How flows scored

| Flow | Can a first-time user finish it? | Verdict |
|---|---|---|
| Sign in / sign up (email + code) | Yes | ✅ Clear. Two gaps: no Sign in on the landing page; role promise is false. |
| Guest: find → book → ticket | Yes (1 ticket only) | 🟡 Good core. Missing quantity, misleading "phone" copy, seat map hidden below the fold. |
| Guest: transfer / cancel / settings | Yes | ✅ Honest, well-worded. "Upcoming" includes past events. |
| Host: onboarding → venue | Yes — once | 🟠 One shot; no edit; dead ends if skipped. |
| Host: floor plan | Yes | 🟡 Powerful, but starts pre-filled and auto-saves a sample room. |
| Host: create → **publish** event | **No** | 🔴 Blocked by missing tier management. |
| Host: get paid (ticket money) | **No such screen** | 🔴 Nothing shows ticket payouts. |
| Host: gate team + live check-in | Yes | ✅ Works end to end; invite delivery gap. |
| Gatekeeper: accept → scan | Yes | ✅ Good; "Leave" needs a confirm. |
| Artist: profile → offers → earnings | Yes | ✅ Best-written area. Needs a first-run checklist. |
| Admin: KYC approve/reject | Yes, blind | 🟠 Approve without seeing evidence. |

---

## Severity guide

- 🔴 **Blocker (B)** — a core job can't be completed in the product.
- 🟠 **High (H)** — wrong, misleading or money/trust-affecting; fix before launch.
- 🟡 **Medium (M)** — friction, confusion, accessibility or responsive problems.
- ⚪ **Low (L)** — polish.

---

## 🔴 Blockers

### B1 · Hosts cannot add ticket tiers, so no event can be published
- **Seen:** event page shows *"Add a ticket tier first — publishing with nothing to sell would put a dead page in front of buyers."* The tiers area says *"This event has no ticket tiers…"* and **Edit event** says the same. No button anywhere. ([05](05-host-create-and-publish-an-event.md))
- **Cause:** there is no tier write API (`TicketTierLightSerializer` is read-only, no URL) and no UI. Tiers exist only via Django admin.
- **Fix:** add a *Ticket tiers* editor on the event page (name, price, quantity, sales window, "free" preset), backed by `POST/PATCH/DELETE /events/<id>/tiers/` restricted to the organiser. Make *Free entry* create a ₹0 tier automatically. Block deleting a tier that has sold tickets.
- **Also:** the publish endpoint (`events/views.py:185`) doesn't check for tiers — the button is the only guard.

### B2 · A venue can only be created during onboarding; no venue editing at all
- **Seen:** *No venue yet* (Business), *"Add your venue first"* (floor plan), and on the event form *"No venues in this city yet. Add yours under **Venue** in the sidebar"* — but **Venue** opens the floor-plan designer, which says to add a venue first. Circular. Name, address, photos and description can't be edited later. ([03](03-host-set-up-venue-and-business.md))
- **Cause:** `createVenue` is called from exactly one place, `components/naada/auth-sheet.tsx:185`. `PATCH /venues/<slug>/` and photo upload exist in the API with no UI.
- **Fix:** a **Venue profile** page (new first item under *Venue*): add / edit name, address, city, capacity, description, photos. Show *Add your venue* as a button in every *No venue yet* state.

### B3 · City filter empties the venue list in the event form
- **Seen:** pick **Mysuru** → *"No venues in this city yet"*, though three Mysuru venues exist. Works with *All cities*. ([05](05-host-create-and-publish-an-event.md))
- **Cause:** `host-event-editor.tsx:237` compares `v.city === cityFilter`; the API gives a number, the `<select>` gives a string.
- **Fix:** compare as strings, or `Number(cityFilter)`. Add a test. (One-line fix.)

---

## 🟠 High

| ID | Finding | Evidence / where | Fix |
|---|---|---|---|
| **H1** | **A sample floor plan is saved and shown to guests as if it were the host's room.** New venues open the designer pre-filled (stage, 4 tables, VIP, speakers…), every checklist item ticked, and it auto-saves after ~1 s. Guests then see *"<Venue> has a seating plan"* with tables that don't exist. | `host-venue-layout.tsx` `DEFAULT_LAYOUT` + auto-save effect; guest screenshot in [01](01-guest-find-and-book-a-ticket.md) | Start empty (or ask "Start from a template?"). Don't auto-save an untouched template. Add a **Publish seating plan to guests** switch, off by default. |
| **H2** | **Demo venue name on a real host's dashboard** right after onboarding ("The Humming Tree"). | `host-home-letterpress.tsx:87` falls back to fixture `users.host.org` when `currentUser.email` hasn't loaded yet | Show the host's real venue name (from `/venues/?mine=true`); never fall back to fixtures. Audit other `data/fixtures.ts` fallbacks. |
| **H3** | **No screen shows the host their ticket money.** *Settlements* lists artist bookings only; the admin Ledger says ticket revenue "isn't on a ledger yet". A host selling tickets can't see what they're owed, when, or what was paid. | `/host/settlements`, `/admin/ledger` | Add a ticket-sales settlement (gross, fees, refunds, net, payout date, status) per event and in total. Link it from the event page tile *Gross ticket revenue*. |
| **H4** | **Admin approves KYC without seeing evidence**, and hosts/artists are never nudged to submit it. Rows show a name and PENDING only. KYC doesn't gate selling either, so nothing prompts a host to complete it. | `/admin/verification`; host dashboard has no checklist | Expand each row: PAN, GSTIN, bank last-4 + holder name, documents, submitted date. Add a *Get paid* checklist item to host/artist dashboards. |
| **H5** | **Host events list shows wrong numbers** (*0/49 · ₹0*) where the event page correctly shows *1/50 · ₹250*. | `/host/events` vs `/host/events/:id` | Use the same source and "sold/total" definition on both. |
| **H6** | **Events page has no "New event" button.** The only entry points are the dashboard cards. | `/host/events` | Add a primary **New event** button to the page header. |
| **H7** | **Fees are described inconsistently.** Host *Bookings*: "Showzy's **7%** is charged to you". Artist *Overview/Earnings*: "venue pays **5%**". Guest sees *Convenience fee* (event page) vs *Booking fee* (checkout, ticket). | `host-bookings.tsx:18`; `artist-*`; `event.tsx:363` vs `checkout-pay.tsx:368` | Pick one rate and one name; drive all copy from the same setting. |
| **H8** | **"We've sent the ticket to your phone."** There is no phone capture at checkout and no SMS. | `ticket-detail.tsx:247` | "Your ticket is in **My tickets** and we've emailed it." (Then make sure the email goes.) |
| **H9** | **Role promise is false:** *"you can change this later in settings."* No such setting. | `auth-sheet.tsx` | ✅ **Copy fixed** (now "To switch later, contact support."). Still open: a real *Settings → Switch role*. |
| **H10** | **"Upcoming" shows past events** (Sep dates in October, still VALID). | `my-tickets.tsx:26` classifies by `status`, not date | Also treat `end_datetime < now` as past; auto-complete events via a scheduled job. |
| **H11** | **Guests can buy only one ticket per checkout.** No quantity control; `qty` is hard-coded 1 in the store. Groups, couples and families (the baby-chair feature's audience) can't sit together. | `store/app-store.tsx:80`; event page | Add a quantity stepper (1–10) on the ticket card; the seat picker already supports N seats. |

---

## 🟡 Medium

| ID | Finding | Fix |
|---|---|---|
| **M1** | **Landing page and empty states.** The signed-out `/` has no *Sign in*; the hero shows static "TRENDING — the room everyone is talking about" even when *Nothing on sale right now*; that empty state has no next step. | Add Sign in to the landing header. Make hero copy truthful or data-driven. Empty state: "Nothing in Mysuru this week — follow artists to hear first" + notify/follow CTA. |
| **M2** | **No first-run guidance.** Host, artist and guest home pages don't say what to do next or what's left. Artist profile is 14% complete but the dashboard doesn't say so. | A dismissible *Get started* checklist on each dashboard (host: venue details → business/KYC → floor plan → event → tiers → publish → gate team). |
| **M3** | **Seat map is out of sight.** After choosing a table the seat chooser appears *below* a long radio list; nothing scrolls to it. The list also repeats what the plan shows. | Scroll/focus the seat map on selection; collapse the list once an area is chosen. |
| **M4** | **Seat map has no numbers or orientation.** Chairs are unlabelled until after purchase ("Seat 1"); no indication of which side faces the stage. | Show seat numbers on the chairs and a small "Stage ↑" marker. |
| **M5** | **Phone layout.** The poster fills the first screen so price/tiers sit below the fold; the sticky bar's price text is nearly invisible (light on cream); top nav truncates ("SETTLE"). | Cap poster height (~40vh) on mobile; fix sticky-bar contrast; shorten host nav labels. |
| **M6** | **Floor-plan designer is cramped below ~1200 px** (canvas ~400 px, tables overlap, three columns squeeze). | Stack palette above canvas under 1100 px; allow collapsing side panels. |
| **M7** | **Gate team rough edges.** (a) Invites aren't emailed — someone without an account is never told; (b) **Leave** has no confirmation; (c) right after accepting, the page says *"No pending invitations… make sure your phone is saved in Settings"*; (d) *Gate duty* is only in the account menu. | Send an invitation email/WhatsApp link with the host's name; confirm *Leave*; hide the "no pending" line when you have doors; show a *Gate duty* chip in the header when you have an invite or an open door. |
| **M8** | **Admin overview has internal copy** ("the process matters more than the code"). | Replace with user-facing text. |
| **M9** | **Test payment sheet** and on-screen OTP are dev behaviour (the deletion code is shown on screen in dev too). | Confirm both are impossible in production builds; add a visible "TEST MODE" ribbon in non-prod. |
| **M10** | **"Doors" is really the start time.** The event form has no doors time; the page prints *Doors 19:00*. | Add *Doors open* to the form, or label it *Starts*. |
| **M11** | **"Free entry" wording** says you still need a tier — but tiers can't be added (see B1). | Free toggle should create the ₹0 tier. |
| **M12** | **Idle save label reads "Saved · Everything here is live"** on Business and Artist Profile before anything is saved, which implies unsaved or incomplete data is public. | Idle: "No changes". After save: "Saved 18:22". Keep "live" for publish actions only. |
| **M13** | **Any host can pick any venue** for an event — the list shows every venue on Showzy, with no owner approval. | Decide the policy: own venues only, or request/approve. |

---

## ⚪ Low / polish

- **L1** Every page fades in from dark for ~1–2 s; during the fade, enabled buttons look disabled and hero subtitles are low contrast. Shorten, or fade only content, not the whole route.
- **L2** The home hero auto-rotates; give it a pause control (accessibility) and pause on hover/focus.
- **L3** Only browse pages are translated; checkout, tickets and every console are English-only.
- **L4** *Cancel* on the ticket page sits beside *My tickets* with no label that it's destructive — fine because a confirm follows, but call it **Cancel ticket**.
- **L5** The seat-map legend ("Free / Yours / Taken") is tiny; use at least 12 px.

---

## Privacy, consent and data deletion (added 11 Oct 2026)

Reviewed separately in [../compliance/](../compliance/README.md); what changed in the product is in [10 · Privacy, cookies and deleting your account](10-privacy-cookies-and-deleting-your-account.md). In UX terms:

- **Was missing:** any notice at sign-in; any cookie notice or choice; the Terms had no seating/gate/children rules; the Refund page said "non-refundable" while the app refunds; deleting an account was a text box that left ticket holder contact details and IP logs behind and let a host with live events delete themselves.
- **Now:** notice at sign-in; banner with equal-weight Accept/Reject and a Preferences panel; Cookie Policy; hosts and artists tick an explicit agreement; a three-step deletion flow that shows what is erased/kept, blocks or warns where needed, and re-authenticates by emailed code.
- **Still open:** unverified phone numbers used for gate invites; no "we've updated our terms" re-consent sheet; KYC forms lack a purpose line. See CONSENT-AUDIT items A–I.

## Heuristic scorecard (Nielsen's 10)

| Heuristic | Score | Notes |
|---|---|---|
| 1 Visibility of system status | 🟡 | Great for payment holds and live gate; weak on first-run progress and the idle "Saved/live" label. |
| 2 Match with the real world | 🟡 | "Gatekeeper", "tables", "doors" fit; "Doors" = start time and "sent to your phone" don't. |
| 3 User control & freedom | 🟠 | Role and venue can't be changed; *Leave* has no undo. |
| 4 Consistency & standards | 🟠 | Fee % and fee name differ across screens; two save-label styles. |
| 5 Error prevention | 🟡 | Seat/stock races handled well; blind KYC approve and sample plan auto-save are not. |
| 6 Recognition rather than recall | 🟡 | Palette and steppers are clear; no checklist means hosts recall the process. |
| 7 Flexibility & efficiency | 🟡 | *Pick for me*, quick table sizes help; no bulk tools or keyboard hints beyond Delete/Esc. |
| 8 Aesthetic & minimalist design | ✅ | Calm, consistent, readable; fade-in and low-contrast hero text are the exceptions. |
| 9 Help users recover from errors | ✅ | Messages say what happened and what to do next. |
| 10 Help & documentation | 🟠 | Nothing in-product until this manual; add contextual help links. |

## Call-to-action review

| Screen | Primary CTA | Clear? | Issue |
|---|---|---|---|
| Landing (signed out) | Explore events near you / Host your event for free | ✅ | No Sign in (M1) |
| Event page | **Get ticket** | ✅ | No quantity (H11) |
| Checkout | **Pay ₹269** | ✅ | Seat map is below a long list (M3) |
| Ticket | Add to calendar / Transfer / Cancel | ✅ | Cancel label (L4) |
| Host dashboard | **Publish an event** | ✅ | Leads to a flow that can't complete (B1) |
| Event page (draft) | **Publish event** | 🔴 | Disabled with no way to satisfy it |
| Events list | — | 🔴 | No **New event** (H6) |
| Business | Save changes | 🟡 | Idle label (M12) |
| Floor plan | Preview as guest | ✅ | Pre-filled template (H1) |
| Gate team | **Send invite** | ✅ | No delivery to non-users (M7) |
| Gate duty | **Accept** / **Start checking tickets** | ✅ | Leave unconfirmed (M7) |
| Artist overview | Browse gig board | ✅ | No profile prompt (M2) |
| Admin verification | **Approve** | 🟠 | No evidence shown (H4) |

---

## Suggested order of work

1. **B1 ticket tiers, B2 venue editor, B3 city filter** — unblocks real hosts. (B3 is one line.)
2. **H3 ticket payouts, H4 KYC evidence, H1 sample plan** — money and trust.
3. **H7–H9, H2** — copy and data truthfulness; mostly text changes.
4. **H5, H6, H10, H11** — correctness and basics guests expect.
5. **M2 first-run checklists**, then M1, M3–M7.

## What this audit did not cover

Real payment providers, email/SMS delivery, camera-based QR scanning on a device, a screen-reader pass, Kannada copy, tablet widths, the dispute and booking-negotiation flows with live data (no disputes or bookings existed), and load/offline behaviour of the door scanner.
