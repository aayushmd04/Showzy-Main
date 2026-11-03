import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { getMyOrders, getOrderLedger } from "@/lib/api";
import type { ApiOrder } from "@/lib/api";
import { TicketSalesStatement } from "@/components/naada/ticket-sales-statement";
import { dateCompact, money } from "@/lib/format";


function orderStatusPill(status: string) {
  if (["released", "completed"].includes(status)) return "PAID";
  if (status === "funded") return "HELD";
  if (status === "accepted") return "PENDING";
  if (status === "disputed") return "DISPUTED";
  if (status === "cancelled") return "CANCELLED";
  return status.toUpperCase();
}

export function HostSettlementsScreen() {
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [openOrder, setOpenOrder] = useState<ApiOrder | null>(null);
  const [ledger, setLedger] = useState<Array<{ entry_type: string; amount: string; description: string }>>([]);

  useEffect(() => {
    getMyOrders()
      .then((r) => setOrders(r.results))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const openDetail = async (order: ApiOrder) => {
    setOpenOrder(order);
    setLedger([]);
    try {
      const r = await getOrderLedger(order.id);
      setLedger(r.results);
    } catch { /* non-fatal */ }
  };

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Settlements"]}>
      <h1 className="t-h1">Settlements</h1>

      <TicketSalesStatement />

      <h2 className="t-section mt-8">Artist bookings</h2>
      <div className="mt-3 overflow-x-auto glass-soft rounded-xl">
        <table className="w-full min-w-[620px] text-left">
          <caption className="sr-only">Artist booking settlements</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="t-micro px-4 py-3">Artist · Date</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">You pay</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">
                Showzy fee
              </th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Artist payout</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted">Loading…</td></tr>
            )}
            {!loading && orders.map((o) => (
              <tr key={o.id} className="border-b border-line last:border-0 hover:bg-paper/5">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  <button type="button" onClick={() => openDetail(o)} className="text-[15px] hover:text-signal text-left">
                    {o.artist_name || "Artist"}
                    <span className="t-mono ml-2 text-[12px] text-muted">{dateCompact(o.performance_date)}</span>
                  </button>
                </th>
                <td className="t-mono px-4 py-3 text-right text-[14px]">{money(parseFloat(o.gross_amount))}</td>
                <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">{money(parseFloat(o.platform_fee))}</td>
                <td className="t-mono px-4 py-3 text-right text-[14px]">{money(parseFloat(o.artist_payout))}</td>
                <td className="px-4 py-3 text-right">
                  <Pill>{orderStatusPill(o.status)}</Pill>
                </td>
              </tr>
            ))}
            {!loading && orders.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  No settlements yet. Accepted bookings appear here once funded.
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
            Artist payouts are held in escrow until you confirm the gig. They auto-release 72 hours after completion.
          </span>
        </p>
      </div>

      {/* Ledger detail modal */}
      {openOrder && (
        <Modal open title={`Order ledger — ${openOrder.artist_name || "Artist"}`} onClose={() => setOpenOrder(null)}>
          <div className="divide-y divide-line">
            {ledger.length === 0 && <p className="py-4 text-center text-muted t-small">No ledger entries yet.</p>}
            {ledger.map((entry, i) => (
              <div key={i} className="flex justify-between py-3">
                <span className="t-small text-muted">{entry.description}</span>
                <span className={`t-mono text-[14px] ${parseFloat(entry.amount) < 0 ? "text-fault" : ""}`}>
                  {parseFloat(entry.amount) >= 0 ? "+" : ""}{money(Math.abs(parseFloat(entry.amount)))}
                </span>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </ConsoleShell>
  );
}
