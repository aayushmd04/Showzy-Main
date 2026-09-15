import { describe, expect, it } from "vitest";
import {
  today,
  daysFromNow,
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

describe("dates that aren't plain YYYY-MM-DD", () => {
  // DRF hands back full timestamps for `created_at` and friends. Splitting one
  // on "-" put "04T10:30:00Z" into the day slot, which is NaN, and the month
  // lookup then threw *during render* — one dispute was enough to take the
  // whole admin screen down to the error boundary.
  it("reads the date half of an ISO timestamp", () => {
    expect(dateCompact("2026-03-04T10:30:00Z")).toBe("04 Mar");
    expect(dateListing("2026-03-04T10:30:00Z")).toBe("WED 04 MAR");
    expect(dateListingFull("2026-03-04T10:30:00.123456+05:30")).toBe("WED 04 MAR 2026");
    expect(dateBody("2026-03-04T10:30:00Z")).toBe("Wednesday 4 March");
    expect(dayOfWeekShort("2026-03-04T10:30:00Z")).toBe("WED");
    expect(dayOfWeekLong("2026-03-04T10:30:00Z")).toBe("Wednesday");
  });

  it("returns a dash for junk rather than throwing", () => {
    // A formatter that throws takes the page with it. One that prints a dash
    // leaves the rest of the screen usable.
    for (const junk of ["", "not a date", "2026", "null", "0000-00-00"]) {
      expect(() => dateCompact(junk)).not.toThrow();
      expect(() => dateListing(junk)).not.toThrow();
      expect(() => dateBody(junk)).not.toThrow();
      expect(() => dayOfWeekLong(junk)).not.toThrow();
    }
    expect(dateCompact("not a date")).toBe("\u2014");
    expect(dateListingFull("")).toBe("\u2014");
  });
});

describe("today", () => {
  it("is a YYYY-MM-DD string", () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("uses the local date, not the UTC one", () => {
    // The distinction matters between 00:00 and 05:30 IST, when UTC is still
    // on the previous day and a UTC-derived "today" hides the night's gigs.
    const d = new Date();
    expect(today()).toBe(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  });
});

describe("daysFromNow", () => {
  it("returns today for zero", () => {
    expect(daysFromNow(0)).toBe(today());
  });

  it("moves forward and backward by whole days", () => {
    expect(daysFromToday(daysFromNow(7))).toBe(7);
    expect(daysFromToday(daysFromNow(-3))).toBe(-3);
  });

  it("rolls over month and year boundaries", () => {
    // 400 days is more than a year, so a naive setDate would have to carry
    // through both a month and a year change to land on a real date.
    expect(daysFromNow(400)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(daysFromToday(daysFromNow(400))).toBe(400);
  });
});

describe("daysFromToday", () => {
  it("is zero for today", () => {
    expect(daysFromToday(today())).toBe(0);
  });

  it("is positive for future dates and negative for past dates", () => {
    expect(daysFromToday(daysFromNow(8))).toBeGreaterThan(0);
    expect(daysFromToday(daysFromNow(-19))).toBeLessThan(0);
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
