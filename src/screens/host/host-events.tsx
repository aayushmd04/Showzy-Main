import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Pill, statusLabel } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { Poster } from "@/components/naada/poster";
import { useStore } from "@/store/app-store";
import { dateListing, money } from "@/lib/format";

/** Events list — the entry point to the event manager, editor and door scanner. */
export function HostEventsScreen() {
  const navigate = useNavigate();
  const { events, venueOf, soldOf, capacityOf, emptyLists } = useStore();
  const rows = emptyLists ? [] : [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events"]}>
      <h1 className="t-h1">Events</h1>

      {rows.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((event) => {
            const venue = venueOf(event);
            return (
              <li key={event.id}>
                <Link
                  to={`/host/events/${event.id}`}
                  className="group flex h-full flex-col border border-line bg-surface transition-colors hover:border-[#3a3a45]"
                >
                  <Poster event={event} compact className="border-0 border-b" />
                  <div className="flex flex-1 flex-col p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                        {dateListing(event.date)}
                      </p>
                      <Pill>{statusLabel(event.status)}</Pill>
                    </div>
                    <p className="t-h3 mt-2 group-hover:text-signal">{event.name}</p>
                    <p className="t-small mt-1 text-muted">{venue?.name}</p>
                    <div className="mt-4 flex items-end justify-between gap-2 border-t border-line pt-3">
                      <span className="t-mono text-[14px]">
                        {soldOf(event)}/{capacityOf(event)}
                      </span>
                      <span className="t-mono text-[13px] text-muted">
                        {money(event.tiers.reduce((sum, t) => sum + t.price * t.sold, 0))}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="No events yet"
            body="Publish your first night and it'll show up here, with its door scanner and settlement."
            actionLabel="Open the editor"
            onAction={() => navigate("/host/events/e4/edit")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
