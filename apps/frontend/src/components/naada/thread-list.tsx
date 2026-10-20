import { useCallback } from "react";
import { Link } from "react-router-dom";
import { Pill } from "@/components/ui/pill";
import { getMyConversations, type ApiConversation } from "@/lib/api";
import { useAsync } from "@/screens/home/home-kit";
import { dateCompact } from "@/lib/format";

/**
 * The conversations the signed-in person is in that no other list on the page
 * already covers, each linking to its thread: not booked yet (a booking's own
 * row opens the thread) and no offer waiting (the offer inbox links to it).
 * What is left is plain chat, or a negotiation that ended without a deal.
 */
export function ThreadList({
  viewer,
  className = "",
}: {
  viewer: "artist" | "host";
  className?: string;
}) {
  const fetchThreads = useCallback(async () => (await getMyConversations()).results, []);
  const threads = useAsync(fetchThreads, "load your conversations");

  if (threads.loading && !threads.data) return null;
  if (threads.error) {
    return (
      <p className={`t-small border border-fault bg-surface px-4 py-3 text-fault ${className}`} role="alert">
        {threads.error}
      </p>
    );
  }
  const rows = (threads.data ?? []).filter((c) => !c.order_id && !c.pending_offer);
  if (rows.length === 0) return null;

  const other = (c: ApiConversation) => (viewer === "artist" ? c.organizer_name : c.artist_name);

  return (
    <section className={className}>
      <h2 className="t-micro mb-2">Conversations</h2>
      <ul className="divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              to={`/bookings/${c.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-paper/5"
            >
              <span className="min-w-0 flex-1 basis-[200px]">
                <span className="block truncate text-[15px]">{other(c)}</span>
                <span className="t-small block truncate text-muted">
                  {c.event_title ? `${c.event_title} · ` : ""}
                  {c.latest_message?.content ?? "No messages yet"}
                </span>
              </span>
              <span className="t-small shrink-0 text-muted">
                {dateCompact((c.last_message_at ?? c.created_at).slice(0, 10))}
              </span>
              <Pill>Open</Pill>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
