import { useState } from "react";
import { Link } from "react-router-dom";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import type { Booking, DisputeOutcome } from "@/data/fixtures";
import { dateListing, money } from "@/lib/format";

/**
 * Dispute queue — mind map §14 / §17. The release timer is suspended at the
 * data level the moment a booking enters `disputed`; this screen is the only
 * way it leaves that state, by an explicit release or refund with a note.
 */
export function AdminDisputesScreen() {
  const { bookings, eventById, artistById, resolveDispute, toast } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const open = bookings.filter((b) => b.state === "disputed");
  const resolved = bookings.filter((b) => b.resolution);
  const active: Booking | undefined = bookings.find((b) => b.id === openId);

  const resolve = (outcome: DisputeOutcome) => {
    if (!active) return;
    resolveDispute(active.id, outcome, note.trim() || "Resolved without a note.");
    toast(
      outcome === "release" ? "Released to artist" : "Refunded to host",
      outcome === "release" ? "success" : "fault",
    );
    setOpenId(null);
    setNote("");
  };

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Disputes"]}>
      <h1 className="t-h1">Disputes</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Funds stay in escrow until a dispute is resolved here — the auto-release timer never
        fires on a disputed booking.
      </p>

      <h2 className="t-micro mt-8">Open</h2>
      {open.length > 0 ? (
        <ul className="mt-3 divide-y divide-line border border-line bg-surface">
          {open.map((b) => {
            const event = eventById(b.eventId);
            const artist = artistById(b.artistId);
            return (
              <li key={b.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
                <div className="min-w-0 flex-1 basis-[240px]">
                  <p className="text-[15px]">
                    {artist?.name} · {event?.name}
                  </p>
                  <p className="t-small mt-0.5 text-muted">
                    {event ? dateListing(event.date) : ""} ·{" "}
                    <span className="t-mono">{money(b.agreedFee ?? 0)}</span> in escrow
                  </p>
                  {b.disputeReason && (
                    <p className="t-small mt-2 max-w-[56ch] border-l-2 border-line pl-3 text-muted">
                      Raised by {b.disputedBy === "artist" ? artist?.name : "the host"}:{" "}
                      {b.disputeReason}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <Pill>Disputed</Pill>
                  <div className="flex gap-2">
                    <Link to={`/bookings/${b.id}`} className="btn btn-secondary btn-sm">
                      Open thread
                    </Link>
                    <Button size="sm" variant="primary" onClick={() => setOpenId(b.id)}>
                      Resolve
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-8 text-center text-muted">
          No open disputes.
        </p>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="t-micro mt-10">Resolved</h2>
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {resolved.map((b) => {
              const event = eventById(b.eventId);
              const artist = artistById(b.artistId);
              return (
                <li key={b.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <Link to={`/bookings/${b.id}`} className="text-[14px] hover:text-signal">
                      {artist?.name} · {event?.name}
                    </Link>
                    <p className="t-small mt-0.5 truncate text-muted">{b.resolution?.note}</p>
                  </div>
                  <Pill tone={b.resolution?.outcome === "release" ? "live" : "fault"}>
                    {b.resolution?.outcome === "release" ? "Released" : "Refunded"}
                  </Pill>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => {
          setOpenId(null);
          setNote("");
        }}
        title="Resolve dispute"
      >
        {active && (
          <>
            <p className="t-body text-paper/90">
              {money(active.agreedFee ?? 0)} is held in escrow for{" "}
              {artistById(active.artistId)?.name}.
            </p>
            {active.disputeReason && (
              <p className="t-small mt-3 border-l-2 border-line pl-3 text-muted">
                {active.disputeReason}
              </p>
            )}
            <label htmlFor="resolution-note" className="t-micro mb-2 mt-5 block">
              Resolution note
            </label>
            <Textarea
              id="resolution-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you decide, and why?"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => resolve("release")}>
                Release to artist
              </Button>
              <Button variant="destructive" onClick={() => resolve("refund")}>
                Refund host
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConsoleShell>
  );
}
