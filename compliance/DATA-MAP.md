# Data map — what personal data Naada holds, why, who sees it, and what happens on deletion

*Built from the Django models and the browser code, 11 Oct 2026. Keep it updated whenever a model or a storage key is added; the Privacy Policy and Cookie Policy must say the same thing.*

## Server-side

| Data | Model / field | Purpose | Who can see it | On account deletion | Retention |
|---|---|---|---|---|---|
| Email (login id) | `User.email` | Sign-in, tickets, notices | The user; staff | **Replaced** by `deleted+<id>.<time>@naada.invalid` | Until deletion |
| Name, display name, bio, website, Instagram, photo, city | `User.*` | Profile, printed on tickets | The user; organisers (name on tickets); artists' profiles are public | **Blanked / removed** | Until deletion |
| Phone (optional) | `User.phone` | Organiser contact; gate invites by phone | The user; staff | **Removed** | Until deletion |
| Last login IP / browser | `User.last_login_ip/device` | Security | Staff | **Removed** | Until deletion |
| Sign-in / deletion codes | `OTPToken` (hash, email, IP) | Authentication | Staff (hash only) | **Deleted** | Valid 10 min; purged with account |
| Ticket holder name, email, phone | `Ticket.holder_*` | Admission; organiser door list | Organiser (name, number, tier, seat); gatekeepers (no email/phone) | **Blanked** (`Deleted user`); ticket row kept | Tax law (up to 8 yrs) |
| Seat / table choice, baby-chair count | `ZoneAllocation` | Seating | Organiser, door team | Kept with the order (no identity) | With the order |
| Orders, totals, status | `Order`, `OrderItem` | Accounting, refunds | The user; organiser (counts); staff | **IP and browser blanked**; row kept | Tax law |
| Payments & refunds | `Payment`, `Refund` | Accounting | Staff; gateway | Kept | Tax law |
| Order IP / user agent | `Order.ip_address/user_agent` | Fraud prevention | Staff | **Removed** | Until deletion |
| Event page views (IP, browser, referrer) | `EventView` | Visit counts, abuse | Staff | **Deleted** | Until deletion (recommend a 90-day purge) |
| Saved events | `EventSave` | Bookmarks | The user | **Deleted** | Until deletion |
| Reviews | `EventReview` | Public feedback | Public | **Deleted** | Until deletion |
| Notifications and preferences | `Notification`, `NotificationPreference` | Inbox, email choices | The user | **Deleted** | Until deletion |
| Gate duty (assignments, scans) | `GateAssignment`, `Ticket.checked_in_by` | Door staffing; audit of who admitted whom | The inviting host; the gatekeeper | Assignments **deleted**; invitee email/phone **blanked on decline/cancel** | Until deletion |
| Chat messages | `chat.Message` | Event chat | Room members | Content **blanked**, marked deleted | Until deletion |
| Booking conversations, offers | `bookings.*` | Agreeing and running a booking | Both parties; staff for flagged items | **Kept** (other party's records); sender shown as "Deleted user" | Booking + dispute window |
| Artist / venue KYC (PAN, GSTIN, bank, KYC status) | `PayoutDetailsMixin` on `Artist`, `Venue` | Tax and payouts | The owner; staff | **PAN/GST/bank blanked**; profile retired | Until deletion / as law requires |
| Push-notification device tokens | `UserDevice` | Push | The user | **Deleted** | Until deletion |
| Proof of consent | `ConsentRecord` | Show what was agreed | Staff | **Kept**, de-identified (user row survives) | Indefinitely |

## Browser-side (see `/cookies`)

| Key | Where | Purpose | Category | Cleared |
|---|---|---|---|---|
| `naada_consent` | Cookie | The cookie choice | Necessary | 12 months |
| `naada_access`, `naada_refresh` | localStorage | Sign-in | Necessary | Sign-out / deletion / expiry |
| `naada_door_queue` | localStorage | Offline scans | Necessary | When sent (left in place on sign-out so nothing is lost) |
| `naada_venue_layout` | localStorage | Unsaved floor-plan draft | Necessary | Sign-out / deletion |
| `naada.nearbyCity` | sessionStorage | City filter | Necessary | Tab close |
| `naada_theme`, `naada_lang` | localStorage (with consent) or sessionStorage | Preferences | **Preferences** | Withdraw consent / tab close |
| `naada-v2-shell`, `naada-v2-tickets` | Cache API (service worker) | Offline tickets | Necessary | Update; tickets cache on sign-out / deletion |

## Erasure rules (`apps/users/privacy.py`)

**Blocks deletion** (the person must resolve these first):
1. Upcoming published/live events they organise (guests may hold tickets).
2. Booking orders in progress (escrow, performance pending) as an artist or organiser member.

**Warns, needs explicit acknowledgement:** valid tickets to upcoming events (access is lost; no refund).

**Always:** a fresh emailed code and typing `DELETE`; all sessions are blacklisted.

## Third parties holding data on our behalf

Payment gateway (Razorpay), email delivery provider, database host, file storage (if enabled), error monitoring (if enabled), Redis host. See [THIRD-PARTY-AUDIT.md](THIRD-PARTY-AUDIT.md). **Action:** sign a data-processing agreement with each and record the hosting region of each (the policy says some may be outside India).
