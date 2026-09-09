import { PLATFORM_FEE_RATE, type Booking, type BookingState, type Settlement } from "@/data/fixtures";

/**
 * A read-only audit trail derived from settlements and bookings — the admin
 * "Ledger view" in the mind map (§14 / §16 `LedgerEntry`). Nothing here is
 * stored; it is recomputed from the same data every other screen reads, so
 * it can never drift out of sync with what hosts and artists see.
 */
export type LedgerEntryType =
  | "ticket_sale"
  | "commission"
  | "booking_funded"
  | "platform_fee"
  | "artist_payout"
  | "refund";

export interface LedgerRow {
  id: string;
  type: LedgerEntryType;
  amount: number;
  eventId?: string;
  bookingId?: string;
  artistId?: string;
}

/** Direction is informational only — this is an audit trail, not a P&L. */
export const LEDGER_DIRECTION: Record<LedgerEntryType, "in" | "out"> = {
  ticket_sale: "in",
  commission: "in",
  booking_funded: "in",
  platform_fee: "in",
  artist_payout: "out",
  refund: "out",
};

const FUNDED_STATES = new Set<BookingState>(["funded", "performed", "released", "disputed"]);

/** A booking only leaves a ledger trace once money actually moved into escrow. */
function wasFunded(booking: Booking): boolean {
  return FUNDED_STATES.has(booking.state) || (booking.state === "cancelled" && Boolean(booking.resolution));
}

export function buildLedger(settlements: Settlement[], bookings: Booking[]): LedgerRow[] {
  const rows: LedgerRow[] = [];

  for (const s of settlements) {
    rows.push({ id: `${s.eventId}-sale`, type: "ticket_sale", amount: s.gross, eventId: s.eventId });
    rows.push({
      id: `${s.eventId}-commission`,
      type: "commission",
      amount: s.platformFee,
      eventId: s.eventId,
    });
  }

  for (const b of bookings) {
    if (!b.agreedFee || !wasFunded(b)) continue;
    const fee = Math.round(b.agreedFee * PLATFORM_FEE_RATE);

    rows.push({
      id: `${b.id}-funded`,
      type: "booking_funded",
      amount: b.agreedFee + fee,
      bookingId: b.id,
      eventId: b.eventId,
      artistId: b.artistId,
    });
    rows.push({ id: `${b.id}-fee`, type: "platform_fee", amount: fee, bookingId: b.id });

    if (b.resolution?.outcome === "refund") {
      rows.push({
        id: `${b.id}-refund`,
        type: "refund",
        amount: b.agreedFee + fee,
        bookingId: b.id,
      });
    } else if (b.state === "released" || b.resolution?.outcome === "release") {
      rows.push({
        id: `${b.id}-payout`,
        type: "artist_payout",
        amount: b.agreedFee,
        bookingId: b.id,
        artistId: b.artistId,
      });
    }
  }

  return rows;
}
