import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import { buildLedger, LEDGER_DIRECTION, type LedgerEntryType } from "@/lib/ledger";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<LedgerEntryType, string> = {
  ticket_sale: "Ticket sale",
  commission: "Commission",
  booking_funded: "Booking funded",
  platform_fee: "Platform fee",
  artist_payout: "Artist payout",
  refund: "Refund",
};

const FILTERS: { value: "all" | LedgerEntryType; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "ticket_sale", label: "Ticket sales" },
  { value: "commission", label: "Commission" },
  { value: "booking_funded", label: "Booking funded" },
  { value: "platform_fee", label: "Platform fee" },
  { value: "artist_payout", label: "Artist payouts" },
  { value: "refund", label: "Refunds" },
];

/**
 * Read-only audit trail (mind map §14 / §16 `LedgerEntry`) — recomputed from
 * settlements and bookings on every render, so it can never drift from what
 * hosts and artists see on their own screens.
 */
export function AdminLedgerScreen() {
  const { settlements, bookings, eventById, artistById } = useStore();
  const [filter, setFilter] = useState<"all" | LedgerEntryType>("all");

  const rows = useMemo(() => buildLedger(settlements, bookings), [settlements, bookings]);
  const filtered = filter === "all" ? rows : rows.filter((r) => r.type === filter);

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Ledger"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Ledger</h1>
        <Select
          value={filter}
          onChange={(v) => setFilter(v as typeof filter)}
          options={FILTERS}
          aria-label="Filter by entry type"
          className="w-[200px]"
        />
      </div>

      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Ledger entries</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="t-micro px-4 py-3">Type</th>
              <th scope="col" className="t-micro px-4 py-3">Event / booking</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const event = row.eventId ? eventById(row.eventId) : undefined;
              const artist = row.artistId ? artistById(row.artistId) : undefined;
              const direction = LEDGER_DIRECTION[row.type];
              return (
                <tr key={row.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-[14px]">{TYPE_LABEL[row.type]}</td>
                  <td className="px-4 py-3 text-[14px] text-muted">
                    {row.bookingId ? (
                      <Link to={`/bookings/${row.bookingId}`} className="hover:text-signal">
                        {event?.name ?? row.bookingId} {artist ? `· ${artist.name}` : ""}
                      </Link>
                    ) : (
                      event?.name ?? "—"
                    )}
                  </td>
                  <td
                    className={cn(
                      "t-mono px-4 py-3 text-right text-[14px]",
                      direction === "out" && "text-muted",
                    )}
                  >
                    {direction === "out" ? "−" : "+"}
                    {money(row.amount)}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-muted">
                  No entries for this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="t-small mt-4 text-muted">
        {filtered.length} {filtered.length === 1 ? "entry" : "entries"}. Recomputed from
        settlements and bookings — nothing here is stored separately.
      </p>
    </ConsoleShell>
  );
}
