# Showzy

Showzy is a monorepo for the live-music marketplace frontend and API.

## Structure

```text
apps/
  frontend/   Vite + React + TypeScript application
  backend/    Django + Django REST Framework API
```

## Setup

Install frontend dependencies from the repository root:

```bash
npm install
```

Create and activate a backend virtual environment, then install Python dependencies:

```bash
cd apps/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cd ../..
```

Copy `apps/backend/.env.example` to `apps/backend/.env` and fill in any local values that you need.

## Development

Run both applications:

```bash
npm run dev
```

The frontend is available at http://localhost:5173 and the API at http://localhost:8000.

Run either application independently with `npm run dev:frontend` or `npm run dev:backend`.

## Checks

```bash
npm run build
npm run typecheck
npm test
npm run backend:check
npm run backend:test
```

The frontend-specific documentation is in [apps/frontend/README.md](apps/frontend/README.md).# Showzy — clickable prototype

A front-end-only prototype of Showzy, a web platform for grassroots live music in Bengaluru.
Built from `naada-prototype-brief.md`.

**No backend, no database, no payment SDK, no real auth.** All state lives in React memory —
refreshing resets to the fixture data, which is expected.

## Run it

```bash
npm install && npm run dev
```

Then open http://localhost:5173.

```bash
npm run build
```

## The demo route (Section 10)

The one path that must work end to end, verified in a browser:

1. Land on **Discover** logged out → filter genre to **Blues**
2. Open **Fuzz & Filter Coffee**
3. **Get ticket** → General tier
4. **Auth sheet** → _Continue as guest_ → **Guest details** (tick consent) → Continue
5. **Payment** → _Pay ₹518_ → 800ms spinner → **Ticket detail** with the perforated stub and QR
6. **My tickets** → the ticket appears under Upcoming
7. Dev switcher (bottom right) → **Host (Sonal)**
8. **Host console** → Fuzz & Filter → **Door scanner**
9. _Simulate valid scan_ → green full-screen overlay, counter goes 47 → 48
10. **Settlements** → Fuzz & Filter shows `HELD`; flip its state toggle to `PAID`
11. Dev switcher → **Artist (Rohan)**
12. **Offers** → open the Sunday Sundowner offer → **Booking thread**
13. Counter ₹5,000 → switch to Host → _Accept_ → _Fund escrow_ (₹5,000 + ₹350 fee = ₹5,350)
14. Switch to Artist → **Earnings** shows ₹5,000 held, zero platform fee

## Prototype affordances

- **Dev role switcher** — fixed bottom-right, dashed border, mono `DEV` label. Switches between
  Logged out · Listener (Meera) · Artist (Rohan) · Host (Sonal). It also carries an
  **empty lists** checkbox that flips every list screen to its empty state.
- **State toggles** (Section 9) — small mono `state:` dropdowns on the booking thread, event
  manager, settlement rows, artist earnings and payment screen.
- **Fake payments** — 800ms spinner, plus a "Simulate a failed payment" link.
- **Fake auth** — any six digits are accepted; `123456` is the placeholder.
- **Simulated door scanner** — no camera access; three simulate buttons and an offline toggle.

## Routes

| Route                                                    | Screen                                              |
| -------------------------------------------------------- | --------------------------------------------------- |
| `/`                                                      | Discover feed                                       |
| `/e/:id`                                                 | Event page                                          |
| `/a/:id`                                                 | Artist profile                                      |
| `/checkout/details` · `/checkout/pay`                    | Guest details · Payment                             |
| `/ticket/:code` · `/tickets`                             | Ticket detail · My tickets                          |
| `/host` · `/host/events` · `/host/events/:id`            | Host overview · events · event manager              |
| `/host/events/:id/edit` · `/host/events/:id/door`        | Event editor · Door scanner                         |
| `/host/artists` · `/host/bookings` · `/host/settlements` | Artist search · Bookings · Settlements              |
| `/artist` · `/artist/offers` · `/artist/gigs`            | Artist overview · Offer inbox · Gigs                |
| `/artist/earnings` · `/artist/profile`                   | Earnings · Profile builder                          |
| `/bookings/:id`                                          | Booking thread (one screen, both roles)             |
| `/lab/keyboard`                                          | Component lab — the `vintage-keyboard` ui component |

Console routes are role-scoped: landing on one in the wrong role shows a one-click switch
rather than a dead end.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS v4, shadcn-style project layout (`@/components/ui`, `@/lib/utils`, `components.json`)
- `motion` for animation, wrapped in `<MotionConfig reducedMotion="user">`
- `lucide-react` for icons
- `react-router-dom` for routing

```
src/
  components/ui/       primitives — button, input, select, pill, modal, toaster, vintage-keyboard
  components/naada/    product components — shells, ticket stub, poster, QR, dev switcher, …
  data/fixtures.ts     Section 6 fixture data, typed
  store/app-store.tsx  the single in-memory store
  screens/             one file per screen
  styles/globals.css   design tokens (Section 3) as Tailwind v4 @theme
```

## Design system

Tokens are defined once in `src/styles/globals.css` and consumed as Tailwind utilities
(`bg-ink`, `text-signal`, `border-line`, …). Dark only, borders over shadows, 4px radius,
0px status pills. All money and codes are set in JetBrains Mono; display type is Archivo.
Posters are typeset from the event name — no stock photography anywhere.

## Decisions and deviations worth knowing

- **Dates are computed from the fixture data, not the brief's prose.** `2026-08-28` is a
  Friday, so Fuzz & Filter renders as `FRI 28 AUG` where the brief's wireframes say `THU`.
  The fixture is the source of truth.
- **Discover hides past events as well as drafts.** The brief only excludes drafts, but a
  "this week" feed that opens with a completed 14 August gig reads as broken, so the feed is
  published events dated today or later.
- **Counter rounds count the opening offer**, which is what makes the fixture booking read
  "2 of 3 counters used" as the brief's wireframe shows.
- **Both sides can act while negotiating**, per the Section 7.13 action table — the host only
  waits while a brief is still in `requested`.
- **The settlement drawer doesn't derive a convenience-fee line.** Fixture gross for
  Fuzz & Filter (₹57,826) is ₹40 below its own tier revenue, so a derived line would print a
  negative number. Tier rows and the fixture's gross/fee/net are shown instead.
- **The artist console shows the whole fixture booking set** rather than only bookings whose
  `artistId` is `a1`. No fixture booking belongs to Rohan, and the brief's own artist screens
  show Deepa's and Kabir's bookings — so this is what reproduces Section 7.16–7.18 exactly.
- **`vintage-keyboard.tsx`** was added to `components/ui` as requested. Its inlined base64
  audio sample was replaced with an equivalent synthesised keypress (Web Audio), which keeps
  the bundle small and behaves identically. It is not part of the Showzy product surface and
  lives on `/lab/keyboard`.

## UI/UX skill

`.claude/skills/ui-ux-pro-max/` holds the design-intelligence skill from
`nextlevelbuilder/ui-ux-pro-max-skill`, used during the build for the accessibility and
dark-mode contrast checks. Query it with:

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "focus ring contrast" --domain ux
```

Accessibility floor met throughout: visible `--signal` focus rings, semantic headings and
landmarks, labelled form fields, alt text / `aria-hidden` on decorative marks, 44px minimum
targets, no horizontal scroll at 390px, and `prefers-reduced-motion` respected globally.
