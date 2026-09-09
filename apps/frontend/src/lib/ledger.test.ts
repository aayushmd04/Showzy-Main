import { describe, expect, it } from "vitest";
import type { Booking, Settlement } from "@/data/fixtures";
import { buildLedger } from "./ledger";

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: "b1",
    eventId: "e1",
    artistId: "a1",
    hostId: "h1",
    state: "requested",
    agreedFee: null,
    quotes: [],
    ...overrides,
  };
}

function settlement(overrides: Partial<Settlement>): Settlement {
  return {
    eventId: "e1",
    gross: 10000,
    platformFee: 700,
    status: "held",
    payoutDate: "2026-09-01",
    ...overrides,
  };
}

describe("buildLedger — ticket settlements", () => {
  it("emits a ticket_sale and a commission row per settlement", () => {
    const rows = buildLedger([settlement({})], []);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.type === "ticket_sale")?.amount).toBe(10000);
    expect(rows.find((r) => r.type === "commission")?.amount).toBe(700);
  });
});

describe("buildLedger — bookings", () => {
  it("produces nothing for a booking that was never funded", () => {
    const rows = buildLedger([], [booking({ state: "requested", agreedFee: null })]);
    expect(rows).toHaveLength(0);
  });

  it("produces nothing for a booking that was declined pre-funding", () => {
    const rows = buildLedger([], [booking({ state: "declined", agreedFee: 5000 })]);
    expect(rows).toHaveLength(0);
  });

  it("records booking_funded and platform_fee once escrow is funded", () => {
    const rows = buildLedger([], [booking({ state: "funded", agreedFee: 9000 })]);
    const funded = rows.find((r) => r.type === "booking_funded");
    const fee = rows.find((r) => r.type === "platform_fee");
    // 7% platform fee (PLATFORM_FEE_RATE), rounded
    expect(fee?.amount).toBe(630);
    expect(funded?.amount).toBe(9000 + 630);
  });

  it("adds an artist_payout row once released, with no refund row", () => {
    const rows = buildLedger([], [booking({ state: "released", agreedFee: 12000 })]);
    expect(rows.find((r) => r.type === "artist_payout")?.amount).toBe(12000);
    expect(rows.find((r) => r.type === "refund")).toBeUndefined();
  });

  it("adds a refund row instead of a payout when a dispute resolves to refund", () => {
    const rows = buildLedger(
      [],
      [
        booking({
          state: "cancelled",
          agreedFee: 12000,
          resolution: { outcome: "refund", note: "no-show", by: "Priya Shenoy", at: "2026-08-16T10:00:00" },
        }),
      ],
    );
    expect(rows.find((r) => r.type === "refund")?.amount).toBe(12000 + 840);
    expect(rows.find((r) => r.type === "artist_payout")).toBeUndefined();
  });

  it("adds an artist_payout row when a dispute resolves to release", () => {
    const rows = buildLedger(
      [],
      [
        booking({
          state: "released",
          agreedFee: 12000,
          resolution: { outcome: "release", note: "gig happened", by: "Priya Shenoy", at: "2026-08-16T10:00:00" },
        }),
      ],
    );
    expect(rows.find((r) => r.type === "artist_payout")?.amount).toBe(12000);
  });

  it("ignores a cancelled booking that was never funded (no resolution)", () => {
    const rows = buildLedger([], [booking({ state: "cancelled", agreedFee: 5000 })]);
    expect(rows).toHaveLength(0);
  });

  it("still shows booking_funded and platform_fee for a booking still in dispute", () => {
    const rows = buildLedger([], [booking({ state: "disputed", agreedFee: 12000 })]);
    expect(rows.some((r) => r.type === "booking_funded")).toBe(true);
    expect(rows.some((r) => r.type === "artist_payout" || r.type === "refund")).toBe(false);
  });
});
