import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { useHostBranch } from "@/components/naada/host-branch";
import { Pill, statusLabel } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { Poster } from "@/components/naada/poster";
import { dateListing, money, today } from "@/lib/format";
import { getMyEvents } from "@/lib/api";
import { adaptEvent } from "@/lib/adapters";
import type { NaadaEvent } from "@/data/fixtures";

export type EventGroup = "upcoming" | "drafts" | "past";

/** Where an event belongs: unfinished work, nights still to come, or nights that are over. */
export function groupOf(event: Pick<NaadaEvent, "status" | "date">, now: string = today()): EventGroup {
  if (event.status === "draft") return "drafts";
  if (event.status === "completed" || event.status === "cancelled" || event.date < now) return "past";
  return "upcoming";
}

const GROUPS: { id: EventGroup; label: string; empty: string }[] = [
  { id: "upcoming", label: "Upcoming", empty: "Nothing coming up. Publish a night and it shows here." },
  { id: "drafts", label: "Drafts", empty: "No drafts. Events you haven't published yet wait here." },
  { id: "past", label: "Past", empty: "No past events yet." },
];

/** Events list — the entry point to the event manager, editor and door scanner. */
export function HostEventsScreen() {
  const navigate = useNavigate();
  const branch = useHostBranch();
  const [events, setEvents] = useState<NaadaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyEvents()
      .then((r) => setEvents(r.results.map(adaptEvent)))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const [picked, setPicked] = useState<EventGroup | null>(null);

  const here = events.filter((e) => branch.includes(e.venueId));
  const byGroup: Record<EventGroup, NaadaEvent[]> = {
    upcoming: here.filter((e) => groupOf(e) === "upcoming").sort((a, b) => a.date.localeCompare(b.date)),
    drafts: here.filter((e) => groupOf(e) === "drafts").sort((a, b) => a.date.localeCompare(b.date)),
    past: here.filter((e) => groupOf(e) === "past").sort((a, b) => b.date.localeCompare(a.date)),
  };
  // Until the host picks one, open on the first tab that has something in it.
  const tab: EventGroup = picked ?? GROUPS.find((g) => byGroup[g.id].length > 0)?.id ?? "upcoming";
  const rows = byGroup[tab];

  const soldOf = (e: NaadaEvent) => e.tiers.reduce((s, t) => s + t.sold, 0);
  const capacityOf = (e: NaadaEvent) => e.tiers.reduce((s, t) => s + t.capacity, 0);

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events"]}>
      <h1 className="t-h1">Events</h1>

      {loading && <p className="t-small mt-6 text-muted">Loading…</p>}

      {!loading && here.length > 0 && (
        <div role="tablist" aria-label="Events" className="mt-5 flex gap-1 overflow-x-auto border-b border-line">
          {GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              aria-selected={tab === g.id}
              onClick={() => setPicked(g.id)}
              className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-signal ${
                tab === g.id ? "border-signal text-paper" : "border-transparent text-muted hover:text-paper"
              }`}
            >
              {g.label} <span className="t-mono ml-1 text-[12px] text-muted">{byGroup[g.id].length}</span>
            </button>
          ))}
        </div>
      )}

      {!loading && rows.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((event) => (
            <li key={event.id}>
              <Link
                to={`/host/events/${event.id}`}
                className="group flex h-full flex-col glass-soft rounded-xl transition-colors hover:border-[#3a3a45]"
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
      ) : !loading && here.length > 0 ? (
        <p className="t-body mt-8 text-muted">{GROUPS.find((g) => g.id === tab)?.empty}</p>
      ) : !loading && (
        <div className="mt-6">
          <EmptyState
            headline="No events yet"
            body="Publish your first night and it'll show up here, with its door scanner and settlement."
            actionLabel="Open the editor"
            onAction={() => navigate("/host/events/new")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
