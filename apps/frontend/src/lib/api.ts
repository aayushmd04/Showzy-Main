/**
 * Naada API client — thin wrapper over fetch.
 * JWT tokens are stored in localStorage and attached to every authenticated request.
 * All mutations return the parsed JSON body or throw an ApiError.
 */

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

  return fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body:
      body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  });
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

export async function requestOtp(email: string): Promise<{ debug_otp?: string }> {
  return post<{ detail: string; debug_otp?: string }>("/auth/request-otp/", { email, purpose: "login" }, false);
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
  role?: string;
  full_name?: string;
  display_name?: string;
  bio?: string;
  instagram?: string;
  website?: string;
  phone?: string;
}): Promise<MeResponse> {
  return patch<MeResponse>("/auth/me/", data);
}

/** Erasure request under the DPDP Act. Irreversible. */
export async function deleteMyAccount(): Promise<{ detail: string }> {
  const res = await request<{ detail: string }>("DELETE", "/auth/me/");
  tokens.clear();
  return res;
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
  if (!refresh) return;
  try {
    await post("/auth/logout/", { refresh }, false);
  } catch {
    // Already expired or blacklisted — the local clear is what matters.
  }
}

// ─── Events ───────────────────────────────────────────────────────────────────

export interface ApiVenue {
  id: string;
  name: string;
  area?: string;       // detail endpoint nested object field
  area_name?: string;  // list endpoint flat field
  city?: string;       // city id or name depending on endpoint
  city_name?: string;  // flat field from list endpoint
  capacity?: number;
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

// ─── Venues ───────────────────────────────────────────────────────────────────

export interface ApiVenueList {
  results: ApiVenue[];
  count: number;
}

export function getVenues(): Promise<ApiVenueList> {
  return get<ApiVenueList>("/venues/", false);
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export interface ApiTicket {
  id: string;
  ticket_number: string;
  qr_data: string;
  qr_image_url: string;
  event: ApiEvent;
  tier: { name: string; price: string };
  status: string;
  checked_in_at?: string;
  created_at: string;
}

export function getMyTickets(): Promise<{ results: ApiTicket[] }> {
  return get<{ results: ApiTicket[] }>("/tickets/mine/");
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
  organizer: ApiOrganizer;
  organizer_name: string;
  artist_name: string;
  artist: string; // artist id
  event?: string; // event id
  created_at: string;
}

export interface ApiMessage {
  id: string;
  conversation: string;
  sender: string;
  content: string;
  is_flagged: boolean;
  created_at: string;
}

export interface ApiOffer {
  id: string;
  conversation: string;
  proposed_by: string;
  fee_amount: string;
  performance_date: string;
  performance_duration_minutes: number;
  set_count: number;
  notes: string;
  status: string;
  counter_of?: string;
  expires_at: string;
  created_at: string;
}

export interface ApiOrder {
  id: string;
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
  organizer: ApiOrganizer;
  artist: string;
  offer: string;
  created_at: string;
}

export function getMyConversations(): Promise<{ results: ApiConversation[] }> {
  return get("/conversations/");
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

export function rejectOffer(offerId: string): Promise<void> {
  return post(`/offers/${offerId}/reject/`);
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

// ─── Gig applications ─────────────────────────────────────────────────────────

export function applyToGig(data: {
  event_id: string;
  message: string;
  proposed_rate?: number;
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
 * Stands in for the browser half of a real gateway while Naada has no merchant
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
}

export function createVenue(data: VenueWritePayload): Promise<ApiVenue> {
  return post<ApiVenue>("/venues/", data);
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
