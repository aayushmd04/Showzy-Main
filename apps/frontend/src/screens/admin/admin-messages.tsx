import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { getFlaggedMessages, reviewFlaggedMessage, type AdminFlaggedMessage } from "@/lib/api";
import { quoteStamp } from "@/lib/format";

/**
 * Flagged messages — the human side of the disintermediation guard (§12).
 * The filter never blocks a message; it only lands here for a person to
 * glance at and decide whether the conversation needs a nudge back on-platform.
 *
 * Backed by the real `GET /admin/flagged-messages/` queue — this used to read
 * fixture data and "Mark reviewed" changed nothing on the backend, so the
 * same message would sit here forever regardless of what an admin did.
 */
export function AdminMessagesScreen() {
  const { toast } = useStore();
  const [flagged, setFlagged] = useState<AdminFlaggedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getFlaggedMessages()
      .then((data) => { if (alive) setFlagged(data); })
      .catch(() => { if (alive) setFlagged([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const markReviewed = async (id: string) => {
    setReviewing(id);
    try {
      await reviewFlaggedMessage(id);
      setFlagged((prev) => prev.filter((m) => m.id !== id));
      toast("Marked reviewed");
    } catch {
      toast("Couldn't mark that reviewed", "fault");
    } finally {
      setReviewing(null);
    }
  };

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Flagged messages"]}>
      <h1 className="t-h1">Flagged messages</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Every chat message is screened for phone numbers, emails, UPI IDs and handles before it
        reaches the other side. Flagging never blocks the message — it just lands here.
      </p>

      {loading ? (
        <p className="t-small mt-6 text-muted">Loading…</p>
      ) : flagged.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {flagged.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
              <ShieldAlert className="mt-1 size-5 shrink-0 text-brass" aria-hidden="true" />
              <div className="min-w-0 flex-1 basis-[280px]">
                <p className="t-small text-muted">
                  {m.event_title ?? m.organizer_name ?? "Booking"}
                  {m.artist_name ? ` · ${m.artist_name}` : ""} ·{" "}
                  <span className="t-mono">{quoteStamp(m.created_at)}</span>
                </p>
                <p className="t-body mt-1">
                  <span className="text-muted">{m.sender_name}: </span>"{m.content}"
                </p>
                <p className="t-small mt-1 text-brass">Flagged — {m.flag_reason}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Button
                  size="sm"
                  disabled={reviewing === m.id}
                  onClick={() => markReviewed(m.id)}
                >
                  Mark reviewed
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small mt-6 border border-dashed border-line px-4 py-8 text-center text-muted">
          Nothing flagged right now.
        </p>
      )}
    </ConsoleShell>
  );
}
