import { useEffect, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { getMyOrders } from "@/lib/api";
import type { ApiOrder } from "@/lib/api";
import { money, dateCompact } from "@/lib/format";

const TDS_RATE = 0.01; // 1% TDS per platform contract

function statusLabel(s: string): string {
  if (s === "released" || s === "completed") return "PAID";
  if (s === "funded" || s === "in_progress") return "HELD";
  if (s === "accepted") return "PENDING";
  return s.toUpperCase();
}

export function ArtistEarningsScreen() {
  const { bankAdded, setBankAdded, toast } = useStore();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyOrders()
      .then((r) => setOrders(r.results))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const waiting = orders
    .filter((o) => !["released", "completed", "cancelled", "refunded"].includes(o.status))
    .reduce((sum, o) => sum + parseFloat(o.gross_amount), 0);

  const showBanner = !bankAdded && waiting > 0;

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Earnings"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Earnings</h1>
      </div>

      {showBanner && (
        <div className="mt-6 flex flex-wrap items-center gap-4 border border-brass bg-surface p-4">
          <AlertTriangle className="size-5 shrink-0 text-brass" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px]">Add your bank details to receive payouts</p>
            <p className="t-small mt-0.5 text-muted">
              <span className="t-mono text-brass">{money(waiting)}</span> is waiting.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => { setBankAdded(true); toast("Bank details added", "success"); }}
          >
            Add bank
          </Button>
        </div>
      )}

      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[560px] text-left">
          <caption className="sr-only">Fees earned per gig</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="t-micro px-4 py-3">Gig / Date</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Fee</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">TDS {Math.round(TDS_RATE * 100)}%</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Net</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && orders.map((o) => {
              const fee = parseFloat(o.gross_amount);
              const tds = Math.round(fee * TDS_RATE);
              const net = fee - tds;
              return (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 text-left text-[15px] font-normal">
                    <span className="block">{o.organizer.name}</span>
                    <span className="t-mono text-[12px] text-muted">{dateCompact(o.performance_date)}</span>
                  </th>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">{money(fee)}</td>
                  <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">{money(tds)}</td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">{money(net)}</td>
                  <td className="px-4 py-3 text-right">
                    <Pill>{statusLabel(o.status)}</Pill>
                  </td>
                </tr>
              );
            })}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  Nothing earned yet. Accepted gigs show up here with their escrow status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 border border-line bg-surface p-4">
        <p className="t-body flex gap-2">
          <Info className="mt-1 size-4 shrink-0 text-live" aria-hidden="true" />
          <span>
            <span className="text-live">Naada takes no fee from artists.</span> The venue pays our
            fee. TDS is a statutory deduction.
          </span>
        </p>
      </div>
    </ConsoleShell>
  );
}
