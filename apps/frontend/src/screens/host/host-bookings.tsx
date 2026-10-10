import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Pill, statusLabel } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import { dateCompact, money } from "@/lib/format";

/** Host-side list of every booking thread. */
export function HostBookingsScreen() {
  const navigate = useNavigate();
  const { bookings, eventById, artistById, emptyLists } = useStore();
  const rows = emptyLists ? [] : bookings;

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Bookings"]}>
      <h1 className="t-h1">Bookings</h1>
      <p className="t-body mt-2 max-w-[52ch] text-muted">
        Artists receive their full quoted fee. Naada's 7% is charged to you on top.
      </p>

      {rows.length > 0 ? (
        <ul className="mt-6 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {rows.map((b) => {
            const event = eventById(b.eventId);
            const artist = artistById(b.artistId);
            const amount = b.agreedFee ?? b.quotes[b.quotes.length - 1]?.amount ?? 0;
            return (
              <li key={b.id}>
                <Link
                  to={`/bookings/${b.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-paper/5"
                >
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="block truncate text-[15px]">{artist?.name}</span>
                    <span className="t-small block truncate text-muted">
                      {event?.name} · {event ? dateCompact(event.date) : ""}
                    </span>
                  </span>
                  <span className="t-mono shrink-0 text-[15px]">{money(amount)}</span>
                  <Pill>{statusLabel(b.state)}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="No bookings yet"
            body="Find an artist, send a brief, and the thread will live here."
            actionLabel="Find an artist"
            onAction={() => navigate("/host/artists")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
