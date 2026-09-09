import { useState } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { StateToggle } from "@/components/naada/state-toggle";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { TDS_RATE } from "@/data/fixtures";
import { money } from "@/lib/format";

const VIEW_STATES = ["bank_pending", "held", "releasing", "paid"] as const;
type ViewState = (typeof VIEW_STATES)[number];

const ROW_STATUS: Record<ViewState, string> = {
  bank_pending: "HELD",
  held: "HELD",
  releasing: "RELEASING",
  paid: "PAID",
};

/**
 * Section 7.18. The zero-fee note is a product promise, so it is set as body
 * copy rather than fine print.
 */
export function ArtistEarningsScreen() {
  const { bookings, eventById, bankAdded, setBankAdded, toast } = useStore();
  const [view, setView] = useState<ViewState>("bank_pending");

  const rows = bookings.filter((b) => ["funded", "performed", "released"].includes(b.state));
  const waiting = rows
    .filter((b) => b.state !== "released")
    .reduce((sum, b) => sum + (b.agreedFee ?? 0), 0);

  const showBanner = view === "bank_pending" && !bankAdded;

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Earnings"]}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-h1">Earnings</h1>
        <StateToggle value={view} options={VIEW_STATES} onChange={setView} />
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
            onClick={() => {
              setBankAdded(true);
              toast("Bank details added", "success");
            }}
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
              <th scope="col" className="t-micro px-4 py-3">Gig</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Fee</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">
                TDS {Math.round(TDS_RATE * 100)}%
              </th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Net</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const event = eventById(b.eventId);
              const fee = b.agreedFee ?? 0;
              const tds = Math.round(fee * TDS_RATE);
              const status = b.state === "released" ? "PAID" : ROW_STATUS[view];
              return (
                <tr key={b.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-3 text-left text-[15px] font-normal">
                    {event?.name}
                  </th>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">{money(fee)}</td>
                  <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">
                    {money(tds)}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">{money(fee - tds)}</td>
                  <td className="px-4 py-3 text-right">
                    <Pill>{status}</Pill>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
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
