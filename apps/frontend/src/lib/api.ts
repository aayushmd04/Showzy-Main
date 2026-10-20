/**
 * Showzy API client — thin wrapper over fetch.
 * JWT tokens are stored in localStorage and attached to every authenticated request.
 * All mutations return the parsed JSON body or throw an ApiError.
 */

import { clearPersonalLocalData } from "@/lib/local-data";

export const API_BASE =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, "") ?? "http://localhost:8000/api/v1";

// ─── Token storage ────────────────────────────────────────────────────────────

const ACCESS_KEY = "naada_access";
const REFRESH_KEY = "naada_refresh";

export const tokens = {
  get access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/**
 * Fired when a refresh attempt fails and the session is genuinely over, so the
 * app can prompt for sign-in instead of leaving the user on a screen whose
 * requests all silently fail.
 */
export const AUTH_EXPIRED_EVENT = "naada:auth-expired";

function announceAuthExpired() {
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

// ─── Error class ──────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public body?: unknown,
  ) {
    super(detail);
  }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

/**
 * Access tokens live 60 minutes. Without this, every session silently died
 * mid-use — a host part-way through door check-in would just start getting
 * failures. Concurrent 401s share one refresh so ten parallel requests don't
 * fire ten refreshes and invalidate each other under token rotation.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refresh = tokens.refresh;
    if (!refresh) return false;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { access?: string; refresh?: string };
      if (!data.access) return false;
      // ROTATE_REFRESH_TOKENS is on, so keep the new refresh when one comes back.
      tokens.set(data.access, data.refresh ?? refresh);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

async function rawRequest(
  method: string,
  path: string,
  body: unknown,
  auth: boolean,
): Promise<Response> {
  const headers: Record<string, string> = {};
  const isFormData = body instanceof FormData;
  // Let the browser set the multipart boundary itself.
  if (!isFormData) headers["Content-Type"] = "application/json";
  if (auth && tokens.access) headers["Authorization"] = `Bearer ${tokens.access}`;

  // Reads give up after 30s so the page can retry; writes and uploads are left alone.
  const timeoutMs = method === "GET" ? 30000 : 0;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    return await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal: controller?.signal,
      body:
        body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    });
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

async function parseBody(res: Response): Promise<unknown> {
  const ct = res.headers.get("content-type") ?? "";
  if (res.status === 204) return null;
  if (ct.includes("application/json")) {
    try {
      return await res.json();
    } catch {
      return null;
    }
  }
  return res.text();
}

/** Pull a usable message out of DRF's several error shapes. */
function extractDetail(data: unknown, fallback: string): string {
  if (typeof data === "string" && data.trim()) return data;
  if (typeof data !== "object" || data === null) return fallback;
  const obj = data as Record<string, unknown>;
  if (typeof obj.detail === "string") return obj.detail;
  // Field errors: {"email": ["This field is required."]}
  for (const value of Object.values(obj)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
  }
  return fallback;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  let res = await rawRequest(method, path, body, auth);

  // One refresh-and-retry on an expired token. Never retry the refresh call
  // itself, and never retry when there was no token to begin with.
  if (res.status === 401 && auth && tokens.access) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawRequest(method, path, body, auth);
    } else {
      tokens.clear();
      announceAuthExpired();
    }
  }

  const data = await parseBody(res);

  if (!res.ok) {
    throw new ApiError(res.status, extractDetail(data, res.statusText), data);
  }

  return data as T;
}

export const get = <T>(path: string, auth = true) =>
  request<T>("GET", path, undefined, auth);

export const post = <T>(path: string, body?: unknown, auth = true) =>
  request<T>("POST", path, body, auth);

export const patch = <T>(path: string, body?: unknown) =>
  request<T>("PATCH", path, body);

export const del = <T>(path: string) => request<T>("DELETE", path);

// ─── SWR fetcher (authenticated GET) ─────────────────────────────────────────

export function swrFetcher<T>(path: string): Promise<T> {
  return get<T>(path);
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface MeResponse {
  id: string;
  email: string;
  full_name: string;
  role: "listener" | "artist" | "venue_owner" | "admin";
  avatar_url?: string;
  created_at: string;
  is_new_user?: boolean;
}

export interface OtpRequestResult {
  debug_otp?: string;
  /** Seconds the code stays valid. */
  expires_in?: number;
  /** Seconds before another code may be requested. */
  resend_after?: number;
}

export async function requestOtp(email: string, turnstileToken?: string): Promise<OtpRequestResult> {
  return post<OtpRequestResult & { detail: string }>(
    "/auth/request-otp/",
    { email, purpose: "login", ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) },
    false,
  );
}

/** Seconds the server asked us to wait, from a 429 on the sign-in endpoints. */
export function retryAfterSeconds(err: unknown): number | undefined {
  if (!(err instanceof ApiError) || err.status !== 429) return undefined;
  const wait = (err.body as { retry_after?: unknown } | undefined)?.retry_after;
  return typeof wait === "number" && wait > 0 ? Math.ceil(wait) : undefined;
}

export async function verifyOtp(
  email: string,
  otp: string,
): Promise<{ access: string; refresh: string; user: MeResponse }> {
  const data = await post<{
    access: string;
    refresh: string;
    user: MeResponse;
  }>("/auth/verify-otp/", { email, otp, purpose: "login" }, false);
  tokens.set(data.access, data.refresh);
  return data;
}

export async function getMe(): Promise<MeResponse> {
  return get<MeResponse>("/auth/me/");
}

export async function updateMe(data: {
  full_name?: string;
  display_name?: string;
  bio?: string;
  instagram?: string;
  website?: string;
  phone?: string;
}): Promise<MeResponse> {
  return patch<MeResponse>("/auth/me/", data);
}

/**
 * Choose (or later change) a role. Deliberately not a field on `updateMe` —
 * that PATCHes the general profile and must never be able to touch role, or
 * any signed-in user could PATCH their way to admin. `role` never accepted
 * "admin" being silently dropped by the general endpoint used to mean role
 * selection at signup looked like it worked but never actually persisted.
 */
export async function setUserRole(role: "attendee" | "artist" | "venue_owner"): Promise<MeResponse> {
  return post<MeResponse>("/auth/set-role/", { role });
}

/** What deleting the account would erase and keep, and anything that blocks it. */
export interface DeletionNote {
  code: string;
  title: string;
  detail: string;
  items?: string[];
  action_url?: string;
}
export interface DeletionReport {
  can_delete: boolean;
  blockers: DeletionNote[];
  warnings: DeletionNote[];
  erase: string[];
  keep: string[];
}

export function getDeletionCheck(): Promise<DeletionReport> {
  return get<DeletionReport>("/auth/me/deletion-check/");
}

/** Emails a one-time code that must accompany the deletion request. */
export function requestDeletionCode(): Promise<{ detail: string; debug_otp?: string }> {
  return post("/auth/me/deletion-code/");
}

/** Erasure request under the DPDP Act. Irreversible; needs the emailed code. */
export async function deleteMyAccount(body: {
  code: string;
  acknowledge_losses?: boolean;
}): Promise<{ detail: string }> {
  const res = await request<{ detail: string }>("DELETE", "/auth/me/", body);
  tokens.clear();
  clearPersonalLocalData();
  return res;
}

// ─── Consent log (what the person agreed to, and when) ────────────────────────

export interface ConsentPosition {
  version: string;
  granted: boolean;
  source: string;
  at: string;
}

export function getConsents(): Promise<Partial<Record<ConsentKind, ConsentPosition>>> {
  return get("/auth/consents/");
}

export type ConsentKind = "terms_privacy" | "organiser_terms" | "marketing_email" | "ticket_contact";

/** Append to the consent log. Safe to call repeatedly: the server ignores exact repeats. */
export function recordConsent(
  kind: ConsentKind,
  version: string,
  source: string,
  granted = true,
): Promise<unknown> {
  return post("/auth/consents/", { kind, version, source, granted }).catch(() => undefined);
}

/** Access request under the DPDP Act — everything we hold, as JSON. */
export function exportMyData(): Promise<Record<string, unknown>> {
  return get<Record<string, unknown>>("/auth/me/export/");
}

/**
 * Blacklist the refresh token server-side before dropping it. Clearing
 * localStorage alone left the refresh token valid for its full 30-day life,
 * which on a shared device is a live session someone else can resume.
 */
export async function logout(): Promise<void> {
  const refresh = tokens.refresh;
  tokens.clear();
  clearPersonalLocalData();
  if (!refresh) return;
  try {
    await post("/auth/logout/", { refresh }, false);
  } catch {
    // Already expired or blacklisted — the local clear is what matters.
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

/** KYC lifecycle shared by Artist and Venue — see PayoutDetailsMixin on the backend. */
export type KycStatus = "pending" | "submitted" | "verified" | "rejected";

export interface ApiVenue {
  id: string;
  name: string;
  area?: string;       // detail endpoint nested object field
  area_name?: string;  // list endpoint flat field
  city?: string;       // city id or name depending on endpoint
  city_name?: string;  // flat field from list endpoint
  capacity?: number;
  primary_photo?: string;
  slug?: string;
  layout?: { version?: number; elements?: unknown[] };
  // Compliance / payout — present on the detail response only.
  gst_number?: string;
  pan_number?: string;
  kyc_status?: KycStatus;
  kyc_submitted_at?: string | null;
  kyc_verified_at?: string | null;
  kyc_rejection_reason?: string;
  bank_account_holder_name?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
  bank_account_last4?: string;
  has_bank_details?: boolean;
  can_receive_payouts?: boolean;
}

export interface ApiTier {
  id: string;
  name: string;
  name_kn: string;
  price: string;
  total_quantity: number;
  sold_quantity: number;
  is_active: boolean;
}

export interface ApiEvent {
  id: string;
  title: string;
  title_kn: string;
  description: string;
  description_kn: string;
  venue: ApiVenue | string; // list endpoint returns UUID string; detail returns nested object
  venue_name?: string;      // list endpoint flat field
  venue_area?: string;      // list endpoint flat field
  city_name?: string;       // list endpoint flat field
  start_datetime: string;
  end_datetime: string;
  status: string;
  genres: Array<{ id: number; name: string; name_kn: string }>;
  ticket_tiers: ApiTier[] | null; // null in list endpoint, array in detail endpoint
  poster_image?: string;
  is_featured: boolean;
  is_seeking_artists?: boolean;
  performance_budget_min?: string;
  performance_budget_max?: string;
  total_sold?: number;
  total_capacity?: number;
  // List-endpoint flat summary fields
  min_price?: number | null;
  seats_left?: number | null;
  is_free?: boolean;
}

export interface ApiEventList {
  results: ApiEvent[];
  count: number;
  next: string | null;
  previous: string | null;
}

export function getEvents(params = ""): Promise<ApiEventList> {
  return get<ApiEventList>(`/events/${params}`, false);
}

export interface ApiPayoutSummary {
  collected: string;
  refunded: string;
  naada_fee: string;
  owed_to_organiser: string;
  paid_out: string;
  balance: string;
}

export function getEventPayoutSummary(eventId: string): Promise<ApiPayoutSummary> {
  return get<ApiPayoutSummary>(`/events/${eventId}/payout-summary/`);
}

export function getMyEvents(): Promise<ApiEventList> {
  return get<ApiEventList>("/events/?mine=true");
}

export function getEvent(id: string): Promise<ApiEvent> {
  return get<ApiEvent>(`/events/${id}/`, false);
}

// ─── Artists ──────────────────────────────────────────────────────────────────

export interface ApiArtist {
  id: string;
  user: { id: string; full_name: string; email: string };
  stage_name: string;
  stage_name_kn: string;
  bio: string;
  city_name?: string;   // list endpoint flat field
  base_city?: string;   // legacy
  fee_range_min?: string;
  fee_range_max?: string;
  genres: Array<{ name: string }>;
  total_gigs: number;
  avg_rating: number;
  profile_image?: string;
  primary_photo?: string;
  // Compliance / payout — present on the detail response only.
  gst_number?: string;
  pan_number?: string;
  kyc_status?: KycStatus;
  kyc_submitted_at?: string | null;
  kyc_verified_at?: string | null;
  kyc_rejection_reason?: string;
  bank_account_holder_name?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
  bank_account_last4?: string;
  has_bank_details?: boolean;
  can_receive_payouts?: boolean;
  /** What a host looks for that this profile lacks ("a photo", "your city"…). Detail endpoint only; empty when complete. */
  profile_gaps?: string[];
}

export interface ApiArtistList {
  results: ApiArtist[];
  count: number;
  next: string | null;
  previous: string | null;
}

export function getArtists(params = ""): Promise<ApiArtistList> {
  return get<ApiArtistList>(`/artists/${params}`, false);
}

/** Admin — artist KYC queue and review, mirrors the organizer/venue equivalents. */
export function getArtistKycQueue(): Promise<ApiArtist[]> {
  return get("/admin/artists/kyc/");
}

export function setArtistKyc(
  id: string,
  status: "verified" | "rejected",
  rejectionReason?: string,
): Promise<ApiArtist> {
  return post<ApiArtist>(`/admin/artists/${id}/kyc/`, {
    status,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
  });
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export interface ApiVenueList {
  results: ApiVenue[];
  count: number;
}

export function getVenues(): Promise<ApiVenueList> {
  return get<ApiVenueList>("/venues/", false);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

/**
 * Mirrors TicketSerializer exactly. The shape is flat — `event` is a bare UUID
 * and the event/venue/tier names come through as sibling fields, not nested
 * objects. Getting this wrong made the adapter throw on real data, so tickets
 * silently never loaded.
 */
export interface ApiTicket {
  id: string;
  order: string;
  ticket_number: string;
  qr_data: string;
  qr_image_url: string | null;
  event: string;
  event_title: string;
  event_date: string;
  venue_name: string | null;
  tier_name: string | null;
  tier_price: string;
  holder_name: string;
  holder_email: string;
  holder_phone: string;
  seat_label: string | null;
  status: string;
  checked_in_at?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string;
  transfer_count: number;
}

export function getMyTickets(): Promise<{ results: ApiTicket[] }> {
  return get<{ results: ApiTicket[] }>("/tickets/mine/");
}

/** Refunds the ticket's admission price — see the backend for the exact
 * cutoff policy. `reason` is optional, shown back to the buyer nowhere but
 * kept for support. */
export function cancelTicketApi(ticketId: string, reason?: string): Promise<ApiTicket> {
  return post(`/tickets/${ticketId}/cancel/`, reason ? { reason } : {});
}

/** The recipient must already have a Showzy account — found by email. */
export function transferTicketApi(
  ticketId: string,
  recipientEmail: string,
  reason?: string,
): Promise<ApiTicket> {
  return post(`/tickets/${ticketId}/transfer/`, {
    recipient_email: recipientEmail,
    ...(reason ? { reason } : {}),
  });
}

export interface ApiInvoice {
  invoice_number: string;
  issued_at: string;
  seller: { name: string; address: string; gstin: string };
  buyer: { name: string; email: string };
  event: { title: string; starts_at: string; venue: string };
  lines: Array<{ description: string; quantity: number; unit_price: string; amount: string }>;
  subtotal: string;
  discount: string;
  booking_fee: string;
  cgst: string;
  sgst: string;
  taxes_total: string;
  total: string;
  currency: string;
  is_tax_invoice: boolean;
}

export function getOrderInvoice(orderId: string): Promise<ApiInvoice> {
  return get(`/ticket-orders/${orderId}/invoice/`);
}

// ─── Bookings (Marketplace B) ─────────────────────────────────────────────────

export interface ApiOrganizer {
  id: string;
  name: string;
  slug: string;
  organizer_type: string;
  kyc_status: string;
}

export interface ApiConversation {
  id: string;
  /** The list endpoint sends the id; older shapes nested the whole organiser. */
  organizer: string | ApiOrganizer;
  organizer_name: string;
  artist_name: string;
  artist: string; // artist id
  event?: string | null; // event id
  event_title?: string | null;
  /** The offer currently waiting for an answer, if there is one. */
  pending_offer?: ApiOffer | null;
  /** The booking an accepted offer in this thread produced. */
  order_id?: string | null;
  latest_message?: { content: string; sender: string } | null;
  last_message_at?: string | null;
  created_at: string;
}

export interface ApiMessage {
  id: string;
  /** The author's user id. */
  sender: string;
  sender_name?: string;
  content: string;
  /** `offer` messages carry the offer they announce in `offer`. */
  message_type: "text" | "offer" | "system";
  linked_offer?: string | null;
  offer?: ApiOffer | null;
  is_flagged: boolean;
  flag_reason?: string;
  conversation_id?: string;
  created_at: string;
}

export interface ApiOffer {
  id: string;
  conversation: string;
  proposed_by: string;
  proposed_by_name?: string;
  fee_amount: string;
  performance_date: string;
  performance_duration_minutes: number;
  set_count: number;
  notes: string;
  status: string;
  counter_of_id?: string | null;
  expires_at: string;
  created_at: string;
}

export interface ApiOrder {
  id: string;
  /** The thread this booking was negotiated in. */
  conversation?: string;
  status: string;
  gross_amount: string;
  platform_fee: string;
  tds_amount: string;
  artist_payout: string;
  performance_date: string;
  performance_duration_minutes: number;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  auto_release_at?: string;
  funded_at?: string;
  completed_at?: string;
  released_at?: string;
  /** The API sends the organiser's id with its name beside it; older shapes nested the whole object. */
  organizer: string | ApiOrganizer;
  organizer_name?: string;
  /** What the venue and artist agreed (the venue pays this plus the Showzy fee). */
  agreed_amount?: string;
  artist: string;
  artist_name?: string;
  /** The event this booking is for, with its title beside it. */
  event?: string | null;
  event_title?: string | null;
  offer?: string;
  created_at: string;
}

/** The fee the venue and artist agreed, before Showzy's fee and TDS. */
export function orderAgreed(order: ApiOrder): number {
  if (order.agreed_amount !== undefined) return parseFloat(order.agreed_amount);
  return parseFloat(order.gross_amount) - parseFloat(order.platform_fee);
}

/** The organiser's name on a booking, whichever shape the order arrived in. */
export function orderOrganizerName(order: ApiOrder): string {
  return order.organizer_name ?? (typeof order.organizer === "object" ? order.organizer.name : "") ?? "";
}

export function getMyConversations(): Promise<{ results: ApiConversation[] }> {
  return get("/conversations/");
}

/** Organisations the signed-in host can book artists for. */
export function getMyOrganizers(): Promise<ApiOrganizer[]> {
  return get("/organizers/");
}

export function createOrganizer(name: string): Promise<ApiOrganizer> {
  return post("/organizers/", { name, organizer_type: "venue" });
}

export function openConversation(data: {
  organizer: string;
  artist: string;
  event?: string | null;
}): Promise<ApiConversation> {
  return post("/conversations/", data);
}

export function getConversationMessages(
  convoId: string,
): Promise<{ results: ApiMessage[] }> {
  return get(`/conversations/${convoId}/messages/`);
}

export function sendMessage(
  convoId: string,
  content: string,
): Promise<ApiMessage> {
  return post(`/conversations/${convoId}/messages/`, { content });
}

export function makeOffer(
  convoId: string,
  data: {
    fee_amount: string;
    performance_date: string;
    performance_duration_minutes: number;
    set_count: number;
    notes?: string;
    counter_of?: string;
  },
): Promise<ApiOffer> {
  return post(`/conversations/${convoId}/offer/`, data);
}

export function acceptOffer(offerId: string): Promise<ApiOrder> {
  return post(`/offers/${offerId}/accept/`);
}

export function rejectOffer(offerId: string): Promise<ApiOffer> {
  return post(`/offers/${offerId}/reject/`);
}

/**
 * Put a host's offer in front of an artist for real: find (or create) the
 * organisation the host books under, open the thread, and send the terms. The
 * artist is notified by the server the moment this returns.
 */
export async function sendOfferToArtist(input: {
  artistId: string;
  eventId?: string | null;
  /** Used only when the host has no organisation yet. */
  organizerName: string;
  feeAmount: number;
  performanceDate: string;
  durationMinutes?: number;
  setCount?: number;
  notes?: string;
}): Promise<ApiOffer> {
  const organizers = await getMyOrganizers();
  const organizer = organizers[0] ?? (await createOrganizer(input.organizerName));
  const convo = await openConversation({
    organizer: organizer.id,
    artist: input.artistId,
    event: input.eventId ?? null,
  });
  return makeOffer(convo.id, {
    fee_amount: String(input.feeAmount),
    performance_date: input.performanceDate,
    performance_duration_minutes: input.durationMinutes ?? 90,
    set_count: input.setCount ?? 2,
    notes: input.notes,
  });
}

export function getMyOrders(): Promise<{ results: ApiOrder[] }> {
  return get("/orders/");
}

export function fundOrder(
  orderId: string,
  data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  },
): Promise<ApiOrder> {
  return post(`/orders/${orderId}/fund/`, data);
}

export function completeOrder(orderId: string): Promise<ApiOrder> {
  return post(`/orders/${orderId}/complete/`);
}

export function raiseDispute(
  orderId: string,
  reason: string,
): Promise<unknown> {
  return post(`/orders/${orderId}/dispute/`, { reason });
}

export function getOrderLedger(
  orderId: string,
): Promise<{ results: Array<{ entry_type: string; amount: string; description: string }> }> {
  return get(`/orders/${orderId}/ledger/`);
}

// ─── Admin / ops console ───────────────────────────────────────────────────────
//
// Every endpoint here requires is_staff and returns platform-wide data — the
// ops console has no bookings, settlements or messages of its own to read.

export interface AdminOverview {
  pending_kyc: number;
  open_disputes: number;
  flagged_messages: number;
  held_transfers: number;
}

export function getAdminOverview(): Promise<AdminOverview> {
  return get("/admin/overview/");
}

export interface AdminLedgerRow {
  id: string;
  entry_type: "gross_charge" | "platform_fee" | "tds" | "artist_payout" | "refund_host" | "reversal";
  amount: string;
  currency: string;
  description: string;
  reference_id: string;
  booking_order_id: string;
  organizer_name: string;
  artist_name: string;
  event_title: string | null;
  created_at: string;
}

export function getAdminLedger(entryType?: string): Promise<{ count: number; results: AdminLedgerRow[] }> {
  return get(`/admin/ledger/${entryType ? `?type=${encodeURIComponent(entryType)}` : ""}`);
}

export interface AdminFlaggedMessage {
  id: string;
  sender: string;
  sender_name: string;
  content: string;
  message_type: string;
  is_flagged: boolean;
  flag_reason: string;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  conversation_id: string;
  organizer_name: string | null;
  artist_name: string | null;
  event_title: string | null;
  created_at: string;
}

/** Unreviewed by default — pass true once a caller wants the cleared queue instead. */
export function getFlaggedMessages(reviewed = false): Promise<AdminFlaggedMessage[]> {
  return get(`/admin/flagged-messages/${reviewed ? "?reviewed=1" : ""}`);
}

export function reviewFlaggedMessage(id: string): Promise<AdminFlaggedMessage> {
  return post(`/admin/flagged-messages/${id}/review/`);
}

export interface AdminOrganizer {
  id: string;
  name: string;
  name_kn: string;
  organizer_type: "venue" | "company" | "individual";
  kyc_status: "pending" | "submitted" | "verified" | "rejected";
  kyc_submitted_at: string | null;
  kyc_verified_at: string | null;
  kyc_rejection_reason: string;
  is_verified: boolean;
  can_book_artists: boolean;
  created_at: string;
}

/** Every organizer, pending/submitted KYC first — the real gate on whether they can fund a booking. */
export function getOrganizerKycQueue(): Promise<AdminOrganizer[]> {
  return get("/admin/organizers/");
}

export function setOrganizerKyc(
  organizerId: string,
  status: "verified" | "rejected",
  rejectionReason?: string,
): Promise<AdminOrganizer> {
  return post(`/admin/organizers/${organizerId}/kyc/`, {
    status,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
  });
}

// ─── Gig applications ─────────────────────────────────────────────────────────

/**
 * Field names here must match what the view reads — it takes `event`, `note`
 * and `proposed_fee`. This posted `event_id`, `message` and `proposed_rate`,
 * so the event lookup found nothing and every application 404'd.
 */
export function applyToGig(data: {
  event: string;
  note: string;
  proposed_fee?: number;
}): Promise<unknown> {
  return post("/gig-applications/", data);
}

export function reviewGigApplication(
  applicationId: string,
  status: "accepted" | "rejected",
  note = "",
): Promise<unknown> {
  return patch(`/gig-applications/${applicationId}/review/`, { status, note });
}

export interface ApiBookingReview {
  id: string;
  direction: "host_to_artist" | "artist_to_host";
  rating: number;
  body: string;
  created_at: string;
}

export interface ApiBookingReviews {
  count: number;
  /** Which way a review from the signed-in person points. */
  my_direction: ApiBookingReview["direction"];
  results: ApiBookingReview[];
}

export function getOrderReviews(orderId: string): Promise<ApiBookingReviews> {
  return get(`/orders/${orderId}/reviews/`);
}

/** One per side, once the gig is done; the server rejects a second. */
export function reviewBooking(
  orderId: string,
  data: { rating: number; body: string },
): Promise<ApiBookingReview> {
  return post(`/orders/${orderId}/reviews/`, data);
}

export function cancelBookingOrder(orderId: string, reason = ""): Promise<ApiOrder> {
  return post(`/orders/${orderId}/cancel/`, { reason });
}

// ─── Ticket orders & payment ──────────────────────────────────────────────────

export interface ApiOrderItem {
  id: string;
  tier: string;
  tier_name?: string;
  quantity: number;
  unit_price: string;
  total_price: string;
}

export interface ApiTicketOrder {
  id: string;
  status: string;
  subtotal: string;
  discount_amount: string;
  platform_fee: string;
  taxes: string;
  total_amount: string;
  currency?: string;
  expires_at?: string;
  items: ApiOrderItem[];
  event: string | ApiEvent;
}

export function createTicketOrder(data: {
  event_id: string;
  items: Array<{ tier_id: string; quantity: number }>;
  promo_code?: string;
  /** Optional floor-plan zone. Omitted for standing-room events. */
  zone_id?: string;
  /** Required, one per ticket, when the chosen zone has named seats. */
  seat_ids?: string[];
  /** Optional free baby/high chairs at the chosen table. */
  baby_chairs?: number;
}): Promise<ApiTicketOrder> {
  return post<ApiTicketOrder>("/ticket-orders/", data);
}

export function getMyTicketOrders(): Promise<ApiTicketOrder[]> {
  return get<ApiTicketOrder[]>("/ticket-orders/mine/");
}

/**
 * Response shape is deliberately gateway-agnostic. `is_mock` tells the UI to
 * run the simulated checkout instead of loading Razorpay's SDK — the only
 * place in the frontend that is allowed to care which gateway is live.
 */
export interface InitiatePaymentResponse {
  payment_id: string;
  order_id: string;
  status?: string;
  gateway: string;
  is_mock?: boolean;
  gateway_order_id?: string;
  razorpay_key?: string;
  amount?: number;
  currency?: string;
}

export function initiatePayment(data: {
  order_id: string;
  gateway?: string;
}): Promise<InitiatePaymentResponse> {
  return post<InitiatePaymentResponse>("/payments/initiate/", {
    gateway: "razorpay",
    ...data,
  });
}

export function verifyPayment(data: {
  order_id: string;
  gateway_order_id: string;
  gateway_payment_id: string;
  gateway_signature: string;
}): Promise<{ status: string; order_id: string }> {
  return post("/payments/verify/", data);
}

/**
 * Stands in for the browser half of a real gateway while Showzy has no merchant
 * account. The backend mints a payment id and signs it with the same HMAC the
 * live gateway uses, so the caller then goes through the ordinary
 * `verifyPayment` path — the signature check is genuinely exercised rather
 * than skipped. Only available while the mock gateway is selected.
 */
export interface MockCheckoutResult {
  status: "success" | "failed" | "pending";
  gateway_order_id?: string;
  gateway_payment_id?: string;
  gateway_signature?: string;
  error?: { code: string; description: string; reason?: string };
}

export function completeMockPayment(data: {
  order_id: string;
  gateway_order_id: string;
  outcome?: "success" | "failed" | "pending";
}): Promise<MockCheckoutResult> {
  return post<MockCheckoutResult>("/payments/mock/checkout/", data);
}

export function requestRefund(data: {
  payment_id: string;
  reason: string;
  reason_detail?: string;
  ticket_id?: string;
}): Promise<unknown> {
  return post("/payments/refund/", data);
}

export interface PromoValidation {
  valid: boolean;
  detail?: string;
  discount_type?: string;
  discount_value?: number;
  discount_amount?: number;
  new_total?: number;
}

export function validatePromo(data: {
  code: string;
  event_id: string;
  order_amount: number;
}): Promise<PromoValidation> {
  return post<PromoValidation>("/promo/validate/", data);
}

// ─── Event authoring (host) ───────────────────────────────────────────────────

export interface EventWritePayload {
  title?: string;
  title_kn?: string;
  description?: string;
  description_kn?: string;
  venue?: string;
  start_datetime?: string;
  end_datetime?: string;
  genres?: number[];
  is_free?: boolean;
  is_seeking_artists?: boolean;
  performance_budget_min?: string;
  performance_budget_max?: string;
  poster_image?: string;
}

export function createEvent(data: EventWritePayload): Promise<ApiEvent> {
  return post<ApiEvent>("/events/create/", data);
}

export function updateEvent(id: string, data: EventWritePayload): Promise<ApiEvent> {
  return patch<ApiEvent>(`/events/${id}/`, data);
}

export function publishEvent(id: string): Promise<{ status: string }> {
  return post(`/events/${id}/publish/`);
}

export function saveEvent(id: string, saved: boolean): Promise<{ saved: boolean }> {
  return saved
    ? post(`/events/${id}/save/`)
    : request("DELETE", `/events/${id}/save/`);
}

export function getSavedEvents(): Promise<ApiEvent[]> {
  return get<ApiEvent[]>("/events/saved/");
}

export function createEventReview(
  id: string,
  data: { rating: number; comment?: string },
): Promise<unknown> {
  return post(`/events/${id}/review/`, data);
}

// ─── Tickets & door ───────────────────────────────────────────────────────────

export function getTicket(id: string): Promise<ApiTicket> {
  return get<ApiTicket>(`/tickets/${id}/`);
}

export interface ScanResult {
  valid: boolean;
  detail?: string;
  ticket?: ApiTicket;
}

/**
 * Resolves rather than throws on a rejected ticket: at a dark venue door an
 * "already used" scan is a normal outcome the UI must render, not an error.
 */
export async function scanTicket(qrData: string): Promise<ScanResult> {
  try {
    return await post<ScanResult>(`/tickets/scan/${qrData}/`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      const body = err.body as ScanResult | undefined;
      return { valid: false, detail: body?.detail ?? err.detail };
    }
    throw err;
  }
}

/** One row of an event's door list. Narrower than a ticket on purpose. */
export interface ApiAttendee {
  id: string;
  ticket_number: string;
  qr_data: string;
  holder_name: string;
  tier_name: string | null;
  seat_label: string;
  status: "valid" | "used" | "cancelled";
  checked_in_at: string | null;
}

/**
 * Everyone holding a ticket to one event, for the door.
 *
 * Organiser-only. The scanner's manual lookup — the thing you reach for when
 * somebody's phone is dead — used to filter the store's tickets, and those are
 * the *signed-in user's own*, so it never matched a guest.
 */
export function getEventAttendees(
  eventId: string,
): Promise<{ event: string; count: number; results: ApiAttendee[] }> {
  return get(`/events/${eventId}/attendees/`);
}

// ─── Gatekeepers: invited, event-scoped ticket checkers ──────────────────────

export interface GateEventCard {
  id: string;
  title: string;
  venue: string;
  starts_at: string;
  ends_at: string;
}

export type GateStatus = "pending" | "active" | "declined" | "revoked";

export interface GateTeamMember {
  id: string;
  status: GateStatus;
  /** The email or phone the host typed. */
  invitee: string;
  label: string;
  /** Filled in once the person accepts with their own account. */
  name: string;
  email: string;
  invited_at: string;
  responded_at: string | null;
  scan_count: number;
  last_scan_at: string | null;
}

export interface GateScan {
  ticket_number: string;
  holder_name: string;
  tier: string;
  seat: string;
  at: string;
  by_id: string | null;
  by_name: string;
}

export interface GateOverview {
  event: GateEventCard;
  window: { opens: string; closes: string; open_now: boolean };
  totals: { admitted: number; tickets: number; by_organiser: number };
  team: GateTeamMember[];
  recent: GateScan[];
  max_team: number;
}

export interface MyGate {
  invitations: { id: string; event: GateEventCard; invited_by: string; label: string; invited_at: string }[];
  assignments: {
    id: string;
    event: GateEventCard;
    label: string;
    open_now: boolean;
    opens: string;
    closes: string;
    scanned: number;
  }[];
}

export const getGateOverview = (eventId: string) => get<GateOverview>(`/events/${eventId}/gate/`);
export const inviteGatekeeper = (
  eventId: string,
  body: { email?: string; phone?: string; label?: string },
) => post<{ id: string; status: GateStatus; has_account: boolean }>(`/events/${eventId}/gate/invite/`, body);
export const revokeGatekeeper = (eventId: string, assignmentId: string) =>
  del<void>(`/events/${eventId}/gate/${assignmentId}/`);
export const getMyGate = () => get<MyGate>("/gate/mine/");
export const acceptGateInvite = (id: string) => post(`/gate/invitations/${id}/accept/`);
export const declineGateInvite = (id: string) => post(`/gate/invitations/${id}/decline/`);

// ─── Artists (own profile) ────────────────────────────────────────────────────

export function getMyArtistProfile(): Promise<ApiArtist> {
  return get<ApiArtist>("/artists/mine/");
}

export function getArtist(id: string): Promise<ApiArtist> {
  return get<ApiArtist>(`/artists/${id}/`, false);
}

export interface ArtistWritePayload {
  stage_name?: string;
  stage_name_kn?: string;
  bio?: string;
  bio_kn?: string;
  city?: string;
  fee_range_min?: string;
  fee_range_max?: string;
  genres?: number[];
  instagram?: string;
  youtube?: string;
  website?: string;
  availability?: unknown;
  gst_number?: string;
  pan_number?: string;
  bank_account_holder_name?: string;
  /** Write-only server-side — accepted here, never echoed back in any response. */
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
}

export function updateArtist(id: string, data: ArtistWritePayload): Promise<ApiArtist> {
  return patch<ApiArtist>(`/artists/${id}/`, data);
}

export function followArtist(id: string, following: boolean): Promise<{ following: boolean }> {
  return following
    ? post(`/artists/${id}/follow/`)
    : request("DELETE", `/artists/${id}/follow/`);
}

// ─── Venues ───────────────────────────────────────────────────────────────────

/** Venues this host owns, with their stored floor plan. */
export async function getMyVenues(): Promise<ApiVenue[]> {
  return unwrap(await get<ApiVenue[] | { results: ApiVenue[] }>("/venues/?mine=true"));
}

export function getVenue(slug: string): Promise<ApiVenue> {
  return get<ApiVenue>(`/venues/${slug}/`, false);
}

export interface VenueWritePayload {
  name?: string;
  name_kn?: string;
  description?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  area?: string;
  pincode?: string;
  capacity?: number;
  stage_type?: string;
  contact_phone?: string;
  contact_email?: string;
  website?: string;
  instagram?: string;
  lat?: string;
  lng?: string;
  google_maps_url?: string;
  has_parking?: boolean;
  is_accessible?: boolean;
  has_bar?: boolean;
  has_restaurant?: boolean;
  has_ac?: boolean;
  has_sound_system?: boolean;
  layout?: unknown;
  gst_number?: string;
  pan_number?: string;
  bank_account_holder_name?: string;
  /** Write-only server-side — accepted here, never echoed back in any response. */
  bank_account_number?: string;
  bank_ifsc_code?: string;
  bank_name?: string;
}

export function createVenue(data: VenueWritePayload): Promise<ApiVenue> {
  return post<ApiVenue>("/venues/", data);
}

/** Admin — venue KYC queue and review, mirrors the organizer/artist equivalents. */
export function getVenueKycQueue(): Promise<ApiVenue[]> {
  return get("/admin/venues/kyc/");
}

export function setVenueKyc(
  slug: string,
  status: "verified" | "rejected",
  rejectionReason?: string,
): Promise<ApiVenue> {
  return post<ApiVenue>(`/admin/venues/${slug}/kyc/`, {
    status,
    ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
  });
}

export function updateVenue(slug: string, data: VenueWritePayload): Promise<ApiVenue> {
  return patch<ApiVenue>(`/venues/${slug}/`, data);
}

export function uploadVenuePhoto(
  slug: string,
  file: File,
  caption = "",
): Promise<{ id: string; image: string }> {
  const form = new FormData();
  form.append("image", file);
  if (caption) form.append("caption", caption);
  return request("POST", `/venues/${slug}/photos/`, form);
}

// ─── Notifications ────────────────────────────────────────────────────────────

export interface ApiNotification {
  id: string;
  notification_type: string;
  title: string;
  body: string;
  action_url?: string;
  is_read: boolean;
  created_at: string;
}

export function getNotifications(unreadOnly = false): Promise<{ results: ApiNotification[] }> {
  return get(`/notifications/${unreadOnly ? "?unread=true" : ""}`);
}

export function markNotificationRead(id: string): Promise<{ is_read: boolean }> {
  return post(`/notifications/${id}/read/`);
}

export function markAllNotificationsRead(): Promise<{ detail: string }> {
  return post("/notifications/read-all/");
}

export interface NotificationPreferences {
  ticket_confirmed_email: boolean;
  ticket_confirmed_push: boolean;
  event_reminder_email: boolean;
  event_reminder_push: boolean;
  event_reminder_hours_before: number;
  new_message_push: boolean;
  artist_new_event_email: boolean;
  artist_new_event_push: boolean;
  marketing_email: boolean;
}

export function getNotificationPreferences(): Promise<NotificationPreferences> {
  return get<NotificationPreferences>("/notifications/preferences/");
}

export function updateNotificationPreferences(
  data: Partial<NotificationPreferences>,
): Promise<NotificationPreferences> {
  return patch<NotificationPreferences>("/notifications/preferences/", data);
}

// ─── Venue floor plan / zones ─────────────────────────────────────────────────

/**
 * One area of a venue's floor plan — a table, the VIP section, the dance floor.
 * Zones live in host-authored JSON on the venue rather than as database rows,
 * so `taken`/`available` are derived per event, never stored counters.
 */
export interface VenueZone {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  capacity: number;
  bookable: boolean;
  taken: number;
  available: number;
}

export interface EventZonesResponse {
  event_id: string;
  venue_name: string;
  has_layout: boolean;
  bookable_count: number;
  places_available: number;
  zones: VenueZone[];
}

/** Public — a buyer choosing a table has not signed in yet. */
export function getEventZones(eventId: string): Promise<EventZonesResponse> {
  return get<EventZonesResponse>(`/events/${eventId}/zones/`, false);
}

// ─── Site configuration ───────────────────────────────────────────────────────

/**
 * Operator details for the public policy pages. Served from the backend so
 * they can be filled in at deploy time without editing frontend source or
 * rebuilding.
 */
export interface SiteConfig {
  name: string;
  legal_name: string;
  address: string;
  email: string;
  phone: string;
  gstin: string;
  grievance_officer: string;
  policies_updated: string;
  missing: string[];
  is_complete: boolean;
  booking_fee: number;
  gst_configured: boolean;
}

export function getSiteConfig(): Promise<SiteConfig> {
  return get<SiteConfig>("/site-config/", false);
}

// ─── Reference data ───────────────────────────────────────────────────────────

export interface ApiCity {
  id: string;
  name: string;
  name_kn?: string;
  slug: string;
}

export interface ApiArea {
  id: string;
  name: string;
  name_kn?: string;
  slug: string;
  city?: string;
}

export interface ApiGenre {
  id: number;
  name: string;
  name_kn?: string;
  slug: string;
}

/** Reference lists are paginated by DRF but small; unwrap either shape. */
function unwrap<T>(data: T[] | { results: T[] }): T[] {
  return Array.isArray(data) ? data : data.results;
}

export async function getCities(): Promise<ApiCity[]> {
  return unwrap(await get<ApiCity[] | { results: ApiCity[] }>("/cities/", false));
}

export async function getAreas(): Promise<ApiArea[]> {
  return unwrap(await get<ApiArea[] | { results: ApiArea[] }>("/areas/", false));
}

export async function getGenres(): Promise<ApiGenre[]> {
  return unwrap(await get<ApiGenre[] | { results: ApiGenre[] }>("/genres/", false));
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface Paginated<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

/**
 * Walk every page of a paginated list endpoint.
 *
 * PAGE_SIZE is 20 and nothing used to request page 2, so the whole product
 * silently capped at 20 events and 20 artists. `maxPages` keeps a runaway
 * dataset from hanging the browser — discovery screens should move to real
 * server-side paging as catalogue size grows.
 */
export async function getAllPages<T>(
  path: string,
  auth = false,
  maxPages = 25,
): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (; page <= maxPages; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const data = await get<Paginated<T>>(`${path}${sep}page=${page}`, auth);
    out.push(...data.results);
    if (!data.next) break;
  }
  return out;
}

/*
 * Whole-catalogue variants. The store used the single-page calls, so the
 * product silently stopped at 20 events and 20 artists with no error and no
 * empty state — event 21 simply did not exist to any user.
 */
export function getAllEvents(params = ""): Promise<ApiEvent[]> {
  return getAllPages<ApiEvent>(`/events/${params}`, false);
}

export function getAllArtists(params = ""): Promise<ApiArtist[]> {
  return getAllPages<ApiArtist>(`/artists/${params}`, false);
}

export function getAllVenues(): Promise<ApiVenue[]> {
  return getAllPages<ApiVenue>("/venues/", false);
}

/** Build an events query string from discover's filter state. */
export function eventQuery(params: {
  search?: string;
  city?: string;
  genre?: string;
  free?: boolean;
  featured?: boolean;
  upcoming?: boolean;
  tonight?: boolean;
  page?: number;
}): string {
  const q = new URLSearchParams();
  if (params.search) q.set("search", params.search);
  if (params.city && params.city !== "all") q.set("city", params.city);
  if (params.genre && params.genre !== "all") q.set("genre", params.genre);
  if (params.free) q.set("free", "true");
  if (params.featured) q.set("featured", "true");
  if (params.upcoming) q.set("upcoming", "true");
  if (params.tonight) q.set("tonight", "true");
  if (params.page && params.page > 1) q.set("page", String(params.page));
  const s = q.toString();
  return s ? `?${s}` : "";
}
