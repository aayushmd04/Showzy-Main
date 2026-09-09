import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Pill, statusLabel } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { Poster } from "@/components/naada/poster";
import { dateListing, money } from "@/lib/format";
import { getMyEvents, type ApiEvent } from "@/lib/api";
import { adaptEvent } from "@/lib/adapters";
import type { NaadaEvent } from "@/data/fixtures";

/** Events list — the entry point to the event manager, editor and door scanner. */
export function HostEventsScreen() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<NaadaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyEvents()
      .then((r) => setEvents(r.results.map(adaptEvent)))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const rows = [...events].sort((a, b) => a.date.localeCompare(b.date));

  const soldOf = (e: NaadaEvent) => e.tiers.reduce((s, t) => s + t.sold, 0);
  const capacityOf = (e: NaadaEvent) => e.tiers.reduce((s, t) => s + t.capacity, 0);

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events"]}>
      <h1 className="t-h1">Events</h1>

      {loading && <p className="t-small mt-6 text-muted">Loading…</p>}

      {!loading && rows.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((event) => (
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
          ))}
        </ul>
      ) : !loading && (
        <div className="mt-6">
          <EmptyState
            headline="No events yet"
            body="Publish your first night and it'll show up here, with its door scanner and settlement."
            actionLabel="Open the editor"
            onAction={() => navigate("/host/events/new/edit")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
