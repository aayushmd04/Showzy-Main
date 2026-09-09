/**
 * Naada API client — thin wrapper over fetch.
 * JWT tokens are stored in localStorage and attached to every authenticated request.
 * All mutations return the parsed JSON body or throw an ApiError.
 */

export const API_BASE = "http://localhost:8000/api/v1";

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

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (auth && tokens.access) {
    headers["Authorization"] = `Bearer ${tokens.access}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // Try to parse JSON for both success and error
  let data: unknown;
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const detail =
      typeof data === "object" && data !== null && "detail" in data
        ? String((data as Record<string, unknown>)["detail"])
        : res.statusText;
    throw new ApiError(res.status, detail, data);
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

export async function requestOtp(email: string): Promise<void> {
  await post("/auth/request-otp/", { email, purpose: "login" }, false);
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

export async function updateMe(data: { role?: string; full_name?: string }): Promise<MeResponse> {
  return patch<MeResponse>("/auth/me/", data);
}

export function logout() {
  tokens.clear();
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
