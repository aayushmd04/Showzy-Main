import { useEffect, useState } from "react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Select } from "@/components/ui/select";
import { getAdminLedger, type AdminLedgerRow } from "@/lib/api";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<AdminLedgerRow["entry_type"], string> = {
  gross_charge: "Gross charge (from host)",
  platform_fee: "Platform fee",
  tds: "TDS deducted",
  artist_payout: "Artist payout",
  refund_host: "Refund to host",
  reversal: "Razorpay reversal",
};

/** Credits show as money in; the rest are money leaving the platform. */
const CREDIT_TYPES = new Set<AdminLedgerRow["entry_type"]>(["gross_charge"]);

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All types" },
  { value: "gross_charge", label: "Gross charges" },
  { value: "platform_fee", label: "Platform fee" },
  { value: "tds", label: "TDS" },
  { value: "artist_payout", label: "Artist payouts" },
  { value: "refund_host", label: "Refunds" },
  { value: "reversal", label: "Reversals" },
];

/**
 * Read-only audit trail over every host↔artist booking's escrow ledger,
 * platform-wide (`GET /admin/ledger/`) — this used to be recomputed client-side
 * from the signed-in user's own settlements and bookings, which is empty for
 * an admin account.
 *
 * Ticket-sale revenue has no ledger-backed model yet on the backend, so this
 * table covers the booking-escrow side only (gross charge, platform fee, TDS,
 * artist payout, refunds, reversals) — it does not invent numbers for the
 * side that isn't tracked.
 */
export function AdminLedgerScreen() {
  const [filter, setFilter] = useState("");
  const [rows, setRows] = useState<AdminLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getAdminLedger(filter || undefined)
      .then((data) => { if (alive) { setRows(data.results); setError(false); } })
      .catch(() => { if (alive) { setRows([]); setError(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [filter]);

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Ledger"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Ledger</h1>
        <Select
          value={filter}
          onChange={setFilter}
          options={FILTERS}
          aria-label="Filter by entry type"
          className="w-[220px]"
        />
      </div>
      <p className="t-small mt-2 max-w-[60ch] text-muted">
        Every money movement on a host↔artist booking, platform-wide. Ticket-sale revenue isn't
        on a ledger yet, so it isn't shown here rather than guessed at.
      </p>

      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[680px] text-left">
          <caption className="sr-only">Ledger entries</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="t-micro px-4 py-3">Type</th>
              <th scope="col" className="t-micro px-4 py-3">Booking</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-[14px]">{TYPE_LABEL[row.entry_type]}</td>
                <td className="px-4 py-3 text-[14px] text-muted">
                  {row.event_title ?? "—"} · {row.artist_name}
                  <span className="block text-muted/70">{row.organizer_name}</span>
                </td>
                <td
                  className={cn(
                    "t-mono px-4 py-3 text-right text-[14px]",
                    !CREDIT_TYPES.has(row.entry_type) && "text-muted",
                  )}
                >
                  {CREDIT_TYPES.has(row.entry_type) ? "+" : "−"}
                  {money(Math.abs(Number(row.amount)))}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">
                  {error ? "Couldn't load the ledger." : "No entries for this filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="t-small mt-4 text-muted">
        {loading
          ? "Loading…"
          : `${rows.length} ${rows.length === 1 ? "entry" : "entries"}${rows.length === 200 ? " (showing the most recent 200)" : ""}.`}
      </p>
    </ConsoleShell>
  );
}
