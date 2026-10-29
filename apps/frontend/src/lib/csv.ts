/**
 * CSV for people who will open it in Excel or Google Sheets.
 *
 * Two things matter beyond quoting commas:
 *  - A cell that starts with = + - @ (or a tab/CR) is a formula to a spreadsheet.
 *    Guest names and notes are typed by strangers, so those are defused with a
 *    leading apostrophe-style prefix before they ever reach a sheet.
 *  - Excel assumes legacy encoding unless the file starts with a byte-order mark,
 *    which turns Kannada and accented names into mojibake.
 */

export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  // Real numbers are numbers (a refund of -50 is not a formula); text is checked.
  let text = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: CsvCell[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/** Hand `rows` to the browser as a file download. */
export function downloadCsv(filename: string, rows: CsvCell[][]): void {
  const blob = new Blob(["﻿", toCsv(rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A filename-safe slug: "Friday Raga — Gokulam!" → "friday-raga-gokulam". */
export function fileSlug(text: string, fallback = "export"): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
