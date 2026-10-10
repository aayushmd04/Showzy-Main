import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Pill } from "@/components/ui/pill";
import { getMyOrders, getMyArtistProfile, orderOrganizerName } from "@/lib/api";
import type { ApiOrder } from "@/lib/api";
import { money, dateCompact } from "@/lib/format";
import { PLATFORM_FEE_RATE, TDS_RATE } from "@/data/fixtures";
import { orderAgreed } from "@/lib/api";

function statusLabel(s: string): string {
  if (s === "released" || s === "completed") return "PAID";
  if (s === "funded" || s === "in_progress") return "HELD";
  if (s === "accepted") return "PENDING";
  return s.toUpperCase();
}

export function ArtistEarningsScreen() {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasBankDetails, setHasBankDetails] = useState<boolean | null>(null);

  useEffect(() => {
    getMyOrders()
      .then((r) => setOrders(r.results))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    getMyArtistProfile()
      .then((p) => setHasBankDetails(Boolean(p.has_bank_details)))
      .catch(() => setHasBankDetails(false));
  }, []);

  const waiting = orders
    .filter((o) => !["released", "completed", "cancelled", "refunded"].includes(o.status))
    .reduce((sum, o) => sum + parseFloat(o.artist_payout), 0);

  const showBanner = hasBankDetails === false && waiting > 0;

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
              <span className="tabular-nums font-semibold text-brass">{money(waiting)}</span> is waiting.
            </p>
          </div>
          <Link to="/artist/profile" className="btn btn-primary btn-sm shrink-0">
            Add bank details
          </Link>
        </div>
      )}

      <div className="mt-6 overflow-x-auto glass-soft rounded-xl">
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
              // Figures come from the booking itself, so the screen can only show
              // what the server actually calculated.
              const fee = orderAgreed(o);
              const tds = parseFloat(o.tds_amount);
              const net = parseFloat(o.artist_payout);
              return (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 text-left text-[15px] font-normal">
                    <span className="block">{orderOrganizerName(o)}</span>
                    <span className="tabular-nums font-semibold text-[12px] text-muted">{dateCompact(o.performance_date)}</span>
                  </th>
                  <td className="tabular-nums font-semibold px-4 py-3 text-right text-[14px]">{money(fee)}</td>
                  <td className="tabular-nums font-semibold px-4 py-3 text-right text-[14px] text-muted">{money(tds)}</td>
                  <td className="tabular-nums font-semibold px-4 py-3 text-right text-[14px]">{money(net)}</td>
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

      <div className="mt-4 glass-soft rounded-xl p-4">
        <p className="t-body flex gap-2">
          <Info className="mt-1 size-4 shrink-0 text-live" aria-hidden="true" />
          <span>
            <span className="text-live">You are not charged a Naada fee.</span> The venue pays our{" "}
            {Math.round(PLATFORM_FEE_RATE * 100)}% fee on top of your agreed fee. You receive your fee
            less {Math.round(TDS_RATE * 100)}% TDS, a statutory deduction.
          </span>
        </p>
      </div>
    </ConsoleShell>
  );
}
