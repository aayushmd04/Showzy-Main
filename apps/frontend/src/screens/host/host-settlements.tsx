import { useState } from "react";
import { Info } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { StateToggle } from "@/components/naada/state-toggle";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import type { SettlementStatus } from "@/data/fixtures";
import { PLATFORM_FEE_RATE } from "@/data/fixtures";
import { dateCompact, money } from "@/lib/format";

const STATUSES: SettlementStatus[] = ["pending", "held", "paid"];

/** Section 7.15 — Settlements. All numbers mono and right-aligned. */
export function HostSettlementsScreen() {
  const { settlements, eventById, bookings, artistById, setSettlementStatus, soldOf } = useStore();
  const [openRow, setOpenRow] = useState<string | null>(null);

  const detail = openRow ? settlements.find((s) => s.eventId === openRow) : null;
  const detailEvent = detail ? eventById(detail.eventId) : null;
  const detailBookings = detail ? bookings.filter((b) => b.eventId === detail.eventId) : [];

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Settlements"]}>
      <h1 className="t-h1">Settlements</h1>

      <div className="mt-6 overflow-x-auto border border-line bg-surface">
        <table className="w-full min-w-[620px] text-left">
          <caption className="sr-only">Ticket settlements by event</caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className="t-micro px-4 py-3">Event</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Gross</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">
                Fee {Math.round(PLATFORM_FEE_RATE * 100)}%
              </th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Net</th>
              <th scope="col" className="t-micro px-4 py-3">Payout</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">Status</th>
              <th scope="col" className="t-micro px-4 py-3 text-right">
                <span className="sr-only">Prototype state</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {settlements.map((s) => {
              const event = eventById(s.eventId);
              return (
                <tr key={s.eventId} className="border-b border-line last:border-0 hover:bg-surface-2">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <button
                      type="button"
                      onClick={() => setOpenRow(s.eventId)}
                      className="text-[15px] hover:text-signal"
                    >
                      {event?.name}
                    </button>
                  </th>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">{money(s.gross)}</td>
                  <td className="t-mono px-4 py-3 text-right text-[14px] text-muted">
                    {money(s.platformFee)}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {money(s.gross - s.platformFee)}
                  </td>
                  <td className="t-mono px-4 py-3 text-[13px] text-muted">
                    {dateCompact(s.payoutDate)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Pill>{s.status}</Pill>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StateToggle
                      label=""
                      value={s.status}
                      options={STATUSES}
                      onChange={(next) => setSettlementStatus(s.eventId, next)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="t-small mt-4 flex gap-2 border border-line bg-surface p-4 text-muted">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Ticket revenue is released 24 hours after the event ends. Artist fees are released 72
          hours after the event.
        </span>
      </p>

      <Modal
        open={Boolean(detail)}
        onClose={() => setOpenRow(null)}
        title={detailEvent?.name ?? "Settlement"}
        className="max-w-[520px]"
      >
        {detail && detailEvent && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="t-small text-muted">
                Payout <span className="t-mono">{dateCompact(detail.payoutDate)}</span>
              </p>
              <Pill>{detail.status}</Pill>
            </div>

            <h3 className="t-micro mt-5">Tickets sold</h3>
            <ul className="mt-2 divide-y divide-line border-y border-line">
              {detailEvent.tiers.map((t) => (
                <li key={t.name} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="t-small">
                    {t.name} · <span className="t-mono">{t.sold}</span> ×{" "}
                    <span className="t-mono">{t.price === 0 ? "FREE" : money(t.price)}</span>
                  </span>
                  <span className="t-mono text-[14px]">{money(t.price * t.sold)}</span>
                </li>
              ))}
              <li className="flex items-center justify-between gap-4 py-2.5">
                <span className="t-small text-muted">
                  <span className="t-mono">{soldOf(detailEvent)}</span> tickets sold
                </span>
                <span className="t-mono text-[14px] text-muted">{money(detail.gross)} gross</span>
              </li>
            </ul>

            <h3 className="t-micro mt-5">Artist fees</h3>
            {detailBookings.length > 0 ? (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {detailBookings.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-4 py-2.5">
                    <span className="t-small">{artistById(b.artistId)?.name}</span>
                    <span className="t-mono text-[14px]">
                      {money(b.agreedFee ?? b.quotes[b.quotes.length - 1]?.amount ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-2 text-muted">No artist fees on this event.</p>
            )}

            <dl className="mt-5 border border-line bg-ink p-4">
              <div className="flex justify-between gap-4 py-1">
                <dt className="t-small text-muted">Gross</dt>
                <dd className="t-mono text-[14px]">{money(detail.gross)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-1">
                <dt className="t-small text-muted">
                  Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
                </dt>
                <dd className="t-mono text-[14px]">−{money(detail.platformFee)}</dd>
              </div>
              <div className="flex justify-between gap-4 border-t border-line pt-2">
                <dt className="text-[15px]">Net to you</dt>
                <dd className="t-mono text-[17px] font-medium">
                  {money(detail.gross - detail.platformFee)}
                </dd>
              </div>
            </dl>
          </>
        )}
      </Modal>
    </ConsoleShell>
  );
}
