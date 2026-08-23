import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { quoteStamp } from "@/lib/format";

/**
 * Flagged messages — the human side of the disintermediation guard (§12).
 * The filter never blocks a message; it only lands here for a person to
 * glance at and decide whether the conversation needs a nudge back on-platform.
 */
export function AdminMessagesScreen() {
  const { messages, bookings, eventById, artistById, reviewFlaggedMessage, toast } = useStore();

  const flagged = messages
    .filter((m) => m.flagged)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Flagged messages"]}>
      <h1 className="t-h1">Flagged messages</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Every chat message is screened for phone numbers, emails, UPI IDs and handles before it
        reaches the other side. Flagging never blocks the message — it just lands here.
      </p>

      {flagged.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {flagged.map((m) => {
            const booking = bookings.find((b) => b.id === m.bookingId);
            const event = booking ? eventById(booking.eventId) : undefined;
            const artist = booking ? artistById(booking.artistId) : undefined;
            return (
              <li key={m.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
                <ShieldAlert className="mt-1 size-5 shrink-0 text-brass" aria-hidden="true" />
                <div className="min-w-0 flex-1 basis-[280px]">
                  <p className="t-small text-muted">
                    {event?.name ?? "Booking"} · {artist?.name} ·{" "}
                    <span className="t-mono">{quoteStamp(m.at)}</span>
                  </p>
                  <p className="t-body mt-1">"{m.body}"</p>
                  <p className="t-small mt-1 text-brass">Flagged — {m.flagReason}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {booking && (
                    <Link to={`/bookings/${booking.id}`} className="btn btn-secondary btn-sm">
                      Open thread
                    </Link>
                  )}
                  <Button
                    size="sm"
                    onClick={() => {
                      reviewFlaggedMessage(m.id);
                      toast("Marked reviewed");
                    }}
                  >
                    Mark reviewed
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-small mt-6 border border-dashed border-line px-4 py-8 text-center text-muted">
          Nothing flagged right now.
        </p>
      )}
    </ConsoleShell>
  );
}
