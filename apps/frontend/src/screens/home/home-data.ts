/**
 * Response shapes for the role home pages.
 *
 * These mirror the DRF serializers exactly. Three of the shared types in
 * src/lib/api.ts don't: `ApiOrder`/`ApiConversation` declare `organizer` as a
 * nested object, while BookingOrderSerializer and BookingConversationSerializer
 * both return a bare UUID plus flat `*_name` fields. Reading the flat fields
 * off the wrong type gives `undefined` at runtime with no type error, so the
 * home screens carry their own honest declarations.
 */
import { get, post } from "@/lib/api";

/* ── Gig applications ───────────────────────────────────────────────────── */

export type GigApplicationStatus = "pending" | "shortlisted" | "rejected" | "accepted";

export interface HomeGigApplication {
  id: string;
  event: string;
  event_title: string;
  artist: string;
  artist_name: string;
  proposed_fee: string | null;
  note: string;
  status: GigApplicationStatus;
  reviewed_at: string | null;
  created_at: string;
}

/**
 * Artists get their own applications; hosts get applications made to events
 * they organise. The endpoint decides from the caller, so there is no
 * parameter to get wrong.
 */
export function getGigApplications(): Promise<{ count: number; results: HomeGigApplication[] }> {
  return get("/gig-applications/");
}

/**
 * Field names are `event`, `proposed_fee` and `note` — the names the view
 * reads. `applyToGig` in src/lib/api.ts posts `event_id`/`proposed_rate`/
 * `message` instead, which the view cannot match, so every apply through it
 * returns 404 "Event not found or not seeking artists."
 */
export function applyToOpenGig(data: {
  event: string;
  proposed_fee?: number;
  note?: string;
}): Promise<HomeGigApplication> {
  return post<HomeGigApplication>("/gig-applications/", data);
}

/* ── Booking conversations ──────────────────────────────────────────────── */

export interface HomeConversation {
  id: string;
  organizer: string;
  organizer_name: string;
  artist: string;
  artist_name: string;
  event: string | null;
  is_active: boolean;
  /** The booking this thread produced, once an offer was accepted. */
  order_id?: string | null;
  /** The offer waiting for an answer, and who put it forward. */
  pending_offer?: { proposed_by?: string } | null;
  last_message_at: string | null;
  latest_message: { content: string; sender: string } | null;
  created_at: string;
}

export function getBookingConversations(): Promise<{
  count: number;
  results: HomeConversation[];
}> {
  return get("/conversations/");
}

/* ── Booking orders (escrow) ────────────────────────────────────────────── */

export interface HomeBookingOrder {
  id: string;
  organizer: string;
  organizer_name: string;
  artist: string;
  artist_name: string;
  event: string | null;
  event_title: string | null;
  status: string;
  gross_amount: string;
  artist_payout: string;
  currency: string;
  performance_date: string;
  funded_at: string | null;
  created_at: string;
}

export function getBookingOrders(): Promise<{ count: number; results: HomeBookingOrder[] }> {
  return get("/orders/");
}

/** Money is committed but the night hasn't happened or settled yet. */
export const LIVE_ORDER_STATUSES = new Set([
  "accepted",
  "funded",
  "in_progress",
  "completed",
  "released",
]);

/** A host still owes this booking a payment into escrow. */
export const AWAITING_FUNDING_STATUSES = new Set(["accepted"]);

/**
 * Something is still owed on this booking — the escrow payment, the night
 * itself, or the release. `released` and `settled` are done and belong in the
 * settlements screen, not on a list headed "needs a decision".
 */
export const OPEN_ORDER_STATUSES = new Set([
  "accepted",
  "funded",
  "in_progress",
  "completed",
  "disputed",
]);
