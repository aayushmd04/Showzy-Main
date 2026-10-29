/**
 * Maps backend API shapes → frontend fixture types used throughout the UI.
 * Keeps the store shape stable so screens don't need changes.
 */

import { API_BASE, orderAgreed } from "./api";
import type {
  ApiEvent,
  ApiArtist,
  ApiVenue,
  ApiTicket,
  ApiOrder,
  ApiConversation,
  ApiOffer,
} from "./api";
import type {
  NaadaEvent,
  Artist,
  Venue,
  Ticket,
  Booking,
  Quote,
} from "@/data/fixtures";

/**
 * Seed imagery sits flat under one of these folders: `/media/artists/x.jpg`.
 * Anything a person uploads is filed deeper — `/media/artists/2026/10/x.jpg`,
 * `/media/events/posters/...` — so a single path segment after the category is
 * what tells the two apart.
 */
const SEED_MEDIA = /^\/media\/(artists|banners|events|restaurants|venues)\/[^/]+$/;

/**
 * Resolve a media URL to where the bytes actually are.
 *
 * Seed imagery is committed to the frontend's `public/media/`, so the CDN
 * serves it for free with no storage bucket. The backend stores the matching
 * relative path in an ImageField, but DRF runs `build_absolute_uri` on the way
 * out and hands back an API-origin URL — which 404s, because those files were
 * never on the API host. Those, and only those, are rewritten to a bare path
 * the frontend serves.
 *
 * A photo someone uploaded lives on the API host (or a bucket) and must keep
 * its full address. Rewriting it to a path on the website's own domain — as
 * this once did for every `/media/` URL — pointed it at a file that does not
 * exist there, so an artist's own photo showed as a broken image.
 */
export function mediaUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    const apiOrigin = new URL(API_BASE, window.location.origin).origin;
    if (url.origin === apiOrigin && SEED_MEDIA.test(url.pathname)) {
      return url.pathname;
    }
    return url.origin === window.location.origin ? url.pathname : url.href;
  } catch {
    return raw;
  }
}

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
    // Local date, to match `time` just below, which is local too.
    // `toISOString()` is UTC: a 00:30 IST show would have come back dated to
    // the previous day while its time still read 00:30, so the card said one
    // date and the clock said another.
    date:
      `${dt.getFullYear()}-` +
      `${String(dt.getMonth() + 1).padStart(2, "0")}-` +
      `${String(dt.getDate()).padStart(2, "0")}`,
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
          minPerOrder: t.min_per_order,
          maxPerOrder: t.max_per_order,
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
    _posterImage: mediaUrl(e.poster_image),
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
    photo: mediaUrl(a.primary_photo ?? a.profile_image),
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
    photo: mediaUrl(v.primary_photo),
  };
}

// ─── Tickets ──────────────────────────────────────────────────────────────────

export function adaptTicket(t: ApiTicket): Ticket {
  return {
    id: t.id,
    code: t.ticket_number,
    eventId: t.event,
    tier: t.tier_name ?? "General",
    seat: t.seat_label || undefined,
    // The ticket endpoint carries no price; the event's tier is the source of
    // truth for what was paid, and the order history for the actual amount.
    price: 0,
    fee: 0,
    holder: t.holder_name || "Me",
    status: t.status === "used" ? "checked_in" : t.status === "cancelled" ? "cancelled" : "valid",
    checkedInAt: t.checked_in_at ?? undefined,
    _qrImageUrl: t.qr_image_url ?? undefined,
    _qrData: t.qr_data,
    _eventTitle: t.event_title,
    _eventDate: t.event_date,
    _venueName: t.venue_name ?? undefined,
    _orderId: t.order,
    _tierPrice: Number(t.tier_price) || 0,
    _transferCount: t.transfer_count,
  } as Ticket & {
    _qrImageUrl?: string;
    _qrData: string;
    _eventTitle: string;
    _eventDate: string;
    _venueName?: string;
    _orderId: string;
    _tierPrice: number;
    _transferCount: number;
  };
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
    // The order names its own event. This used to fall back to `order.offer`,
    // which the server does not send, so every booking lost its event and the
    // artist's screens showed "Event offer" instead of the night.
    eventId: conversation?.event ?? order.event ?? order.offer ?? "",
    artistId: order.artist,
    hostId: typeof order.organizer === "string" ? order.organizer : (order.organizer?.id ?? ""),
    state: ORDER_STATUS_MAP[order.status] ?? "accepted",
    // The fee both sides agreed. `gross_amount` is what the venue pays, which
    // now includes Showzy's fee on top.
    agreedFee: orderAgreed(order),
    message: "",
    quotes: [
      {
        by: "host" as const,
        amount: orderAgreed(order),
        at: order.created_at,
        accepted: true,
      },
    ],
    _orderId: order.id,
    _conversationId: order.conversation,
    _eventTitle: order.event_title ?? undefined,
    _platformFee: parseFloat(order.platform_fee),
    _artistPayout: parseFloat(order.artist_payout),
    _performanceDate: order.performance_date,
  } as Booking & {
    _orderId: string;
    _conversationId?: string;
    _eventTitle?: string;
    _platformFee: number;
    _artistPayout: number;
    _performanceDate: string;
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

/** The title the server sent with a booking, for when the event itself is not in the catalogue. */
export function bookingEventTitle(b: Booking): string | undefined {
  return (b as Booking & { _eventTitle?: string })._eventTitle;
}
