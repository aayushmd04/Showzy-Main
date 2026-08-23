import { describe, expect, it } from "vitest";
import {
  TODAY,
  dateBody,
  dateCompact,
  dateListing,
  dateListingFull,
  dayOfWeekLong,
  dayOfWeekShort,
  daysFromToday,
  money,
  pluralise,
  quoteStamp,
  ticketCode,
} from "./format";

describe("money", () => {
  it("formats with the rupee symbol and Indian digit grouping", () => {
    expect(money(499)).toBe("₹499");
    expect(money(57826)).toBe("₹57,826");
    expect(money(0)).toBe("₹0");
  });

  it("rounds fractional values", () => {
    expect(money(499.6)).toBe("₹500");
    expect(money(499.4)).toBe("₹499");
  });
});

describe("date formatting", () => {
  // 2026-08-28 is a Friday — the README calls this out explicitly as the
  // fixture's source of truth, overriding the brief's wireframes.
  it("dateListing renders day-of-week, day and month in caps", () => {
    expect(dateListing("2026-08-28")).toBe("FRI 28 AUG");
  });

  it("dateListingFull appends the year", () => {
    expect(dateListingFull("2026-08-28")).toBe("FRI 28 AUG 2026");
  });

  it("dateBody renders full names for body copy", () => {
    expect(dateBody("2026-08-28")).toBe("Friday 28 August");
  });

  it("dateCompact renders a short title-case month", () => {
    expect(dateCompact("2026-08-28")).toBe("28 Aug");
  });

  it("dayOfWeekShort and dayOfWeekLong agree with dateListing", () => {
    expect(dayOfWeekShort("2026-08-28")).toBe("FRI");
    expect(dayOfWeekLong("2026-08-28")).toBe("Friday");
  });

  it("quoteStamp combines date and time compactly", () => {
    expect(quoteStamp("2026-08-18T16:00:00")).toBe("18 Aug · 16:00");
  });
});

describe("daysFromToday", () => {
  it("is zero for the fixture TODAY", () => {
    expect(daysFromToday(TODAY)).toBe(0);
  });

  it("is positive for future dates and negative for past dates", () => {
    expect(daysFromToday("2026-08-28")).toBeGreaterThan(0);
    expect(daysFromToday("2026-08-01")).toBeLessThan(0);
  });
});

describe("pluralise", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralise(1, "day")).toBe("1 day");
  });

  it("uses the default plural (adds s) for everything else", () => {
    expect(pluralise(0, "day")).toBe("0 days");
    expect(pluralise(4, "day")).toBe("4 days");
  });

  it("accepts an irregular plural", () => {
    expect(pluralise(2, "artist", "artists")).toBe("2 artists");
  });
});

describe("ticketCode", () => {
  it("matches the NAADA-XXXX-XXXX shape", () => {
    expect(ticketCode()).toMatch(/^NAADA-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("avoids visually ambiguous characters (0/O, 1/I/L)", () => {
    const code = ticketCode();
    expect(code).not.toMatch(/[01IO]/);
  });
});
