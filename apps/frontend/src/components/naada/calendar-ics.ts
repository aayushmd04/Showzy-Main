/**
 * A real .ics file for a ticket, built in the browser and handed over as a
 * blob download. No server round trip, no library.
 *
 * Times go out as UTC stamps (`…Z`). The API sends `+05:30` instants, so the
 * moment is preserved exactly and every calendar app renders it in the
 * reader's own zone — which is what someone travelling to the gig needs. That
 * also avoids shipping a VTIMEZONE block we would have to keep in step with
 * the tz database.
 */

export interface CalendarEvent {
  /** Stable per ticket, so re-downloading updates the entry instead of duplicating it. */
  uid: string;
  title: string;
  /** ISO 8601 with an offset, straight from the API. */
  start: string;
  end: string;
  location: string;
  description: string;
  url?: string;
}

/** RFC 5545 §3.3.11 text escaping. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** `20260912T041808Z` */
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Content lines are limited to 75 octets — not characters. A Kannada event
 * title is three bytes per glyph, so folding on character count corrupts it.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let bytes = 0;

  for (const char of line) {
    const size = encoder.encode(char).length;
    // Continuation lines spend one of their 75 octets on the leading space.
    const limit = parts.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);

  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent): string {
  const now = stamp(new Date().toISOString());

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Showzy//Tickets//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${esc(event.uid)}`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(event.end)}`,
    `SUMMARY:${esc(event.title)}`,
    `LOCATION:${esc(event.location)}`,
    `DESCRIPTION:${esc(event.description)}`,
    ...(event.url ? [`URL:${esc(event.url)}`] : []),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    // The whole point of the file: a nudge while there is still time to leave.
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "TRIGGER:-PT2H",
    `DESCRIPTION:${esc(`${event.title} starts in 2 hours`)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  // CRLF endings, and a trailing one — some parsers drop the last line without it.
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** Hand the file to the browser. Returns false when the browser blocked it. */
export function downloadIcs(filename: string, ics: string): boolean {
  try {
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick — Safari needs the URL alive through the click.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
