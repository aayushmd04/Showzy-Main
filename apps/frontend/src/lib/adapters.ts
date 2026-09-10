/**
 * Maps backend API shapes → frontend fixture types used throughout the UI.
 * Keeps the store shape stable so screens don't need changes.
 */

import type {
  ApiEvent,
  ApiArtist,
  ApiVenue,
  ApiTicket,
  ApiOrder,
  ApiConversation,
  ApiMessage,
  ApiOffer,
} from "./api";
import type {
  NaadaEvent,
  Artist,
  Venue,
  Ticket,
  Booking,
  ChatMessage,
  Quote,
} from "@/data/fixtures";

// ─── Events ───────────────────────────────────────────────────────────────────

export function adaptEvent(e: ApiEvent): NaadaEvent {
  const dt = new Date(e.start_datetime);
  // List endpoint returns venue as UUID string; detail endpoint returns a nested object
  const venueId = typeof e.venue === "string" ? e.venue : (e.venue as ApiVenue)?.id ?? "";
  return {
    id: e.id,
    name: e.title,
    venueId,
    hostId: "api",
    date: dt.toISOString().slice(0, 10),
    time: dt.toTimeString().slice(0, 5),
    status: e.status as NaadaEvent["status"],
    genres: (e.genres ?? []).map((g) => g.name),
    lineup: [],
    tiers: e.ticket_tiers
      ? e.ticket_tiers.map((t) => ({
          id: t.id,
          name: t.name,
          price: parseFloat(t.price),
          capacity: t.total_quantity,
          sold: t.sold_quantity,
        }))
      : [
          {
            name: e.is_free ? "Free Entry" : "General",
            price: e.min_price ?? 0,
            capacity: (e.seats_left ?? 0) + 0,
            sold: 0,
          },
        ],
    description: e.description,
    checkedIn: 0,
    isSeekingArtist: e.is_seeking_artists ?? false,
    budgetMin: e.performance_budget_min ? parseFloat(e.performance_budget_min) : undefined,
    budgetMax: e.performance_budget_max ? parseFloat(e.performance_budget_max) : undefined,
    _posterImage: e.poster_image,
    _cityName: e.city_name ?? "",
  } as NaadaEvent & { _posterImage?: string; _cityName?: string };
}

// ─── Artists ──────────────────────────────────────────────────────────────────

export function adaptArtist(a: ApiArtist): Artist {
  return {
    id: a.id,
    name: a.stage_name || a.user?.full_name || "",
    genres: a.genres.map((g) => g.name),
    city: a.city_name ?? a.base_city ?? "",
    feeMin: a.fee_range_min ? parseFloat(a.fee_range_min) : 0,
    feeMax: a.fee_range_max ? parseFloat(a.fee_range_max) : 0,
    gigsPlayed: a.total_gigs ?? 0,
    rating: a.avg_rating ?? 0,
    bio: a.bio ?? "",
    kycStatus: "pending",
  };
}

// ─── Venues ───────────────────────────────────────────────────────────────────

export function adaptVenue(v: ApiVenue): Venue {
  return {
    id: v.id,
    name: v.name,
    area: v.area_name ?? v.area ?? v.city_name ?? v.city ?? "",
    capacity: v.capacity ?? 0,
  };
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function adaptTicket(t: ApiTicket): Ticket {
  return {
    id: t.id,
    code: t.ticket_number,
    eventId: t.event.id,
    tier: t.tier.name,
    price: parseFloat(t.tier.price),
    fee: parseFloat(t.tier.price) > 0 ? 19 : 0,
    holder: "Me",
    status: t.status === "used" ? "checked_in" : t.status === "cancelled" ? "cancelled" : "valid",
    checkedInAt: t.checked_in_at ?? undefined,
    _qrImageUrl: t.qr_image_url,
    _qrData: t.qr_data,
  } as Ticket & { _qrImageUrl: string; _qrData: string };
}

// ─── Bookings / Orders ────────────────────────────────────────────────────────

const ORDER_STATUS_MAP: Record<string, Booking["state"]> = {
  accepted: "accepted",
  funded: "funded",
  in_progress: "funded",
  completed: "performed",
  released: "released",
  settled: "released",
  cancelled: "cancelled",
  refunded: "cancelled",
  partially_refunded: "cancelled",
  disputed: "disputed",
};

export function adaptOrder(
  order: ApiOrder,
  conversation?: ApiConversation,
): Booking {
  return {
    id: order.id,
    eventId: conversation?.event ?? order.offer ?? "",
    artistId: order.artist,
    hostId: order.organizer.id,
    state: ORDER_STATUS_MAP[order.status] ?? "accepted",
    agreedFee: parseFloat(order.gross_amount),
    message: "",
    quotes: [
      {
        by: "host" as const,
        amount: parseFloat(order.gross_amount),
        at: order.created_at,
        accepted: true,
      },
    ],
    _orderId: order.id,
    _platformFee: parseFloat(order.platform_fee),
    _artistPayout: parseFloat(order.artist_payout),
    _performanceDate: order.performance_date,
  } as Booking & {
    _orderId: string;
    _platformFee: number;
    _artistPayout: number;
    _performanceDate: string;
  };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export function adaptMessage(
  m: ApiMessage,
  convoId: string,
): ChatMessage {
  return {
    id: m.id,
    bookingId: convoId,
    sender: "host",
    body: m.content,
    at: m.created_at,
    flagged: m.is_flagged,
  };
}

// ─── Offers → Quotes ──────────────────────────────────────────────────────────

export function adaptOfferToQuote(o: ApiOffer): Quote {
  return {
    by: "host",
    amount: parseFloat(o.fee_amount),
    at: o.created_at,
    accepted: o.status === "accepted",
  };
}
