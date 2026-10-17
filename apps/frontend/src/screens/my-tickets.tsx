import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { StubGlyph } from "@/components/naada/ticket-stub";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import { dateListing } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/lib/use-meta";

/** Section 7.8 — My tickets. Compact stub variant as the row. */
export function MyTicketsScreen() {
  usePageMeta({ title: "My tickets", description: "Your Showzy tickets and QR codes." });
  const navigate = useNavigate();
  const { tickets, eventById, venueOf, emptyLists } = useStore();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");

  const hasAnyTickets = !emptyLists && tickets.length > 0;

  const rows = emptyLists
    ? []
    : tickets.filter((t) => {
        const event = eventById(t.eventId);
        if (!event) return false;
        const isPast = event.status === "completed" || t.status === "checked_in";
        return tab === "past" ? isPast : !isPast;
      });

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[880px] px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="t-display">My tickets</h1>
          <div className="flex" role="tablist" aria-label="Ticket timeframe">
            {(["upcoming", "past"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "min-h-11 border px-4 text-[14px] capitalize transition-colors",
                  tab === t
                    ? "border-paper bg-surface-2 text-paper"
                    : "border-line text-muted hover:text-paper",
                  t === "past" && "-ml-px",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {rows.length > 0 ? (
          <ul className="mt-6 divide-y divide-line border-y border-line">
            {rows.map((ticket) => {
              const event = eventById(ticket.eventId)!;
              const venue = venueOf(event);
              return (
                <li key={ticket.id}>
                  <Link
                    to={`/ticket/${ticket.code}`}
                    className="flex items-center gap-4 py-4 transition-colors hover:bg-surface-2"
                  >
                    <StubGlyph code={ticket.code} dim={ticket.status === "cancelled"} />
                    <div className="min-w-0 flex-1">
                      <p className="t-h3 truncate">{event.name}</p>
                      <p className="t-small truncate text-muted">
                        {venue?.name} · {ticket.tier}
                      </p>
                      <p className="t-mono mt-1 truncate text-[12px] text-muted">{ticket.code}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                        {dateListing(event.date)}
                      </span>
                      <Pill>{ticket.status === "checked_in" ? "Checked in" : ticket.status}</Pill>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="mt-6">
            {/* "No tickets yet" is a lie when they hold tickets that are simply
                on the other tab. Say which shelf is empty. */}
            <EmptyState
              headline={
                tab === "past"
                  ? "Nothing here yet"
                  : hasAnyTickets
                    ? "Nothing coming up"
                    : "No tickets yet"
              }
              body={
                tab === "past"
                  ? "Gigs you've been to will show up here afterwards."
                  : hasAnyTickets
                    ? "Your past gigs are on the other tab. Nothing booked ahead right now."
                    : "When you book a gig it'll show up here."
              }
              actionLabel="Find something on"
              onAction={() => navigate("/")}
            />
          </div>
        )}
      </div>
    </PublicShell>
  );
}
