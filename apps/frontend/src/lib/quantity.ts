import type { Tier } from "@/data/fixtures";

/** The most tickets one checkout can hold. The server enforces the same number. */
export const MAX_TICKETS_PER_ORDER = 10;

/**
 * How many tickets of `tier` a buyer may put in one order: the global cap, the
 * tier's own per-order limit, and what is still unsold, whichever is smallest.
 * Zero means nothing can be bought.
 */
export function maxTickets(tier: Pick<Tier, "capacity" | "sold" | "maxPerOrder">): number {
  const left = Math.max(0, tier.capacity - tier.sold);
  const own = tier.maxPerOrder && tier.maxPerOrder > 0 ? tier.maxPerOrder : MAX_TICKETS_PER_ORDER;
  return Math.min(MAX_TICKETS_PER_ORDER, own, left);
}

/** The fewest a buyer must take (some tiers are sold in pairs or groups). */
export function minTickets(tier: Pick<Tier, "minPerOrder">): number {
  return Math.max(1, tier.minPerOrder ?? 1);
}

/** Pull any quantity back inside what is allowed for `tier`. */
export function clampTickets(
  qty: number,
  tier: Pick<Tier, "capacity" | "sold" | "maxPerOrder" | "minPerOrder">,
): number {
  const hi = maxTickets(tier);
  const lo = Math.min(minTickets(tier), hi || 1);
  return Math.min(Math.max(Math.trunc(qty) || lo, lo), Math.max(hi, lo));
}
