import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { Pill, statusLabel } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { dateCompact, money } from "@/lib/format";

/** Section 7.9 — Host console home. */
export function HostHomeScreen() {
  const navigate = useNavigate();
  const { events, settlements, soldOf, capacityOf, toast } = useStore();

  const upcoming = events.filter((e) => e.status === "published");
  const ticketsSold = upcoming.reduce((sum, e) => sum + soldOf(e), 0);
  const held = settlements
    .filter((s) => s.status === "held")
    .reduce((sum, s) => sum + s.gross, 0);
  const nextPayout = settlements
    .filter((s) => s.status !== "paid")
    .map((s) => s.payoutDate)
    .sort()[0];

  const ordered = [...events].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Overview"]}>
      <h1 className="t-h1">Overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={String(upcoming.length)} label="Upcoming events" />
        <StatTile value={String(ticketsSold)} label="Tickets sold" />
        <StatTile value={money(held)} label="Held" tone="brass" />
        <StatTile value={nextPayout ? dateCompact(nextPayout) : "—"} label="Next payout" />
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <h2 className="t-micro">Your events</h2>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            toast("New events start as a draft — here's one already in progress");
            navigate("/host/events/e4/edit");
          }}
        >
          <Plus className="size-4" aria-hidden="true" />
          New event
        </Button>
      </div>

      <ul className="mt-3 divide-y divide-line border border-line bg-surface">
        {ordered.map((event) => (
          <li key={event.id}>
            <Link
              to={`/host/events/${event.id}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2"
            >
              <span className="min-w-0 flex-1 basis-[180px] truncate text-[15px]">
                {event.name}
              </span>
              <span className="t-mono w-[68px] shrink-0 text-[13px] text-muted">
                {dateCompact(event.date)}
              </span>
              <span className="t-mono w-[72px] shrink-0 text-[13px] text-muted">
                {soldOf(event)}/{capacityOf(event)}
              </span>
              <span className="shrink-0">
                <Pill>{statusLabel(event.status)}</Pill>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ConsoleShell>
  );
}
