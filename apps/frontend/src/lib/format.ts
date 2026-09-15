/** Formatting helpers. Copy rules live in Section 11 of the brief. */

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const DAYS_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** Shown in place of a date we can't read, rather than crashing the screen. */
const NO_DATE = "—";

/**
 * Parse `YYYY-MM-DD`, or the date half of a full ISO timestamp.
 *
 * The `slice(0, 10)` is load-bearing. DRF returns timestamps like
 * `2026-03-04T10:30:00Z`, and splitting that on "-" put `"04T10:30:00Z"` into
 * the day — `Number()` of which is NaN. Every formatter below then indexed its
 * month array at NaN, got `undefined`, and threw a TypeError *during render*.
 * One dispute with a real `created_at` was enough to take the whole admin
 * Disputes screen down to the error boundary.
 */
export function parseDate(iso: string): Date {
  const [y, m, d] = String(iso ?? "").slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** A Date that survived parsing. `new Date(NaN)` is a Date, and lies. */
function valid(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** `₹4,280` — always with the symbol, always rendered in mono by the caller. */
export function money(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** `THU 28 AUG` — for listings. */
export function dateListing(iso: string): string {
  const d = parseDate(iso);
  if (!valid(d)) return NO_DATE;
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

/** `THU 28 AUG 2026` */
export function dateListingFull(iso: string): string {
  const d = parseDate(iso);
  if (!valid(d)) return NO_DATE;
  return `${dateListing(iso)} ${d.getFullYear()}`;
}

/** `Thursday 28 August` — for body copy. */
export function dateBody(iso: string): string {
  const d = parseDate(iso);
  if (!valid(d)) return NO_DATE;
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** `28 Aug` */
export function dateCompact(iso: string): string {
  const d = parseDate(iso);
  if (!valid(d)) return NO_DATE;
  const m = MONTHS[d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")} ${m[0]}${m.slice(1).toLowerCase()}`;
}

export function dayOfWeekShort(iso: string): string {
  const d = parseDate(iso);
  return valid(d) ? DAYS[d.getDay()] : NO_DATE;
}

/** `Wednesday` — for the "nothing on" empty-state headline. */
export function dayOfWeekLong(iso: string): string {
  const d = parseDate(iso);
  return valid(d) ? DAYS_LONG[d.getDay()] : NO_DATE;
}

/** `18 Aug · 16:00` — quote timestamps. */
export function quoteStamp(isoDateTime: string): string {
  const [date, time] = isoDateTime.split("T");
  return `${dateCompact(date)} · ${(time ?? "").slice(0, 5)}`;
}

export function pluralise(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Today, as `YYYY-MM-DD`, in the viewer's own timezone.
 *
 * This used to be a frozen string from the fixture era, which meant every
 * "is this event still upcoming?" test on the home page, the host home and the
 * gig board compared against a date in the past — a real deployment would have
 * gone on advertising gigs that had already happened.
 *
 * Built from the local getters rather than `toISOString().slice(0, 10)`: that
 * one is UTC, so between midnight and 05:30 IST it reports yesterday and the
 * night's own listings vanish from the site.
 */
export function today(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/** Today shifted by `days` — `daysFromNow(7)` is the end of "this week". */
export function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/** Whole days between today and an ISO date. Negative means it has passed. */
export function daysFromToday(iso: string): number {
  const ms = parseDate(iso).getTime() - parseDate(today()).getTime();
  return Math.round(ms / 86_400_000);
}

export function ticketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `NAADA-${block(4)}-${block(4)}`;
}
