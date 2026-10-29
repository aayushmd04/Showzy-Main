import { describe, expect, it } from "vitest";
import { clampTickets, maxTickets, minTickets, MAX_TICKETS_PER_ORDER } from "./quantity";

const tier = (over = {}) => ({ capacity: 100, sold: 0, ...over });

describe("maxTickets", () => {
  it("is ten for an ordinary tier with plenty left", () => {
    expect(maxTickets(tier())).toBe(10);
    expect(MAX_TICKETS_PER_ORDER).toBe(10);
  });

  it("never exceeds ten, even when the tier allows more", () => {
    expect(maxTickets(tier({ maxPerOrder: 50 }))).toBe(10);
  });

  it("honours a tier that allows fewer", () => {
    expect(maxTickets(tier({ maxPerOrder: 4 }))).toBe(4);
  });

  it("cannot go past what is still unsold", () => {
    expect(maxTickets(tier({ capacity: 20, sold: 17 }))).toBe(3);
  });

  it("is zero when sold out", () => {
    expect(maxTickets(tier({ capacity: 20, sold: 20 }))).toBe(0);
    expect(maxTickets(tier({ capacity: 20, sold: 25 }))).toBe(0);
  });
});

describe("minTickets", () => {
  it("is one unless the tier is sold in groups", () => {
    expect(minTickets({})).toBe(1);
    expect(minTickets({ minPerOrder: 2 })).toBe(2);
    expect(minTickets({ minPerOrder: 0 })).toBe(1);
  });
});

describe("clampTickets", () => {
  it("keeps a valid quantity as it is", () => {
    expect(clampTickets(6, tier())).toBe(6);
  });

  it("pulls too many back to ten and too few up to one", () => {
    expect(clampTickets(99, tier())).toBe(10);
    expect(clampTickets(0, tier())).toBe(1);
    expect(clampTickets(-3, tier())).toBe(1);
    expect(clampTickets(Number.NaN, tier())).toBe(1);
  });

  it("respects a group tier's minimum and what is left", () => {
    expect(clampTickets(1, tier({ minPerOrder: 2 }))).toBe(2);
    expect(clampTickets(8, tier({ capacity: 10, sold: 7 }))).toBe(3);
  });
});
