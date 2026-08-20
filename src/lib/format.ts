/** Formatting helpers. Copy rules live in Section 11 of the brief. */

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
const DAYS_LONG = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** `₹4,280` — always with the symbol, always rendered in mono by the caller. */
export function money(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/** `THU 28 AUG` — for listings. */
export function dateListing(iso: string): string {
  const d = parseDate(iso);
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

/** `THU 28 AUG 2026` */
export function dateListingFull(iso: string): string {
  return `${dateListing(iso)} ${parseDate(iso).getFullYear()}`;
}

/** `Thursday 28 August` — for body copy. */
export function dateBody(iso: string): string {
  const d = parseDate(iso);
  return `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`;
}

/** `28 Aug` */
export function dateCompact(iso: string): string {
  const d = parseDate(iso);
  const m = MONTHS[d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")} ${m[0]}${m.slice(1).toLowerCase()}`;
}

export function dayOfWeekShort(iso: string): string {
  return DAYS[parseDate(iso).getDay()];
}

/** `Wednesday` — for the "nothing on" empty-state headline. */
export function dayOfWeekLong(iso: string): string {
  return DAYS_LONG[parseDate(iso).getDay()];
}

/** `18 Aug · 16:00` — quote timestamps. */
export function quoteStamp(isoDateTime: string): string {
  const [date, time] = isoDateTime.split("T");
  return `${dateCompact(date)} · ${(time ?? "").slice(0, 5)}`;
}

export function pluralise(n: number, one: string, many = one + "s"): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Days between today (the fixture "today") and an ISO date. */
export const TODAY = "2026-08-20";

export function daysFromToday(iso: string): number {
  const ms = parseDate(iso).getTime() - parseDate(TODAY).getTime();
  return Math.round(ms / 86_400_000);
}

export function ticketCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const block = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `NAADA-${block(4)}-${block(4)}`;
}
