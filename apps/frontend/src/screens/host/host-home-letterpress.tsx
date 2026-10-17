import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, ChevronRight, Handshake, Users } from "lucide-react";

import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { useStore } from "@/store/app-store";
import { getMyEvents } from "@/lib/api";
import { adaptEvent } from "@/lib/adapters";
import type { NaadaEvent } from "@/data/fixtures";
import { today, dateListing, money } from "@/lib/format";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function tableDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${String(d).padStart(2, "0")} ${MONTHS[m - 1]}`;
}

/** Status as a word with a colour, using the theme's own colours so it reads in both modes. */
function statusStyle(status: string): string {
  if (status === "published" || status === "sales_closed" || status === "live") return "text-live border-live/40";
  if (status === "completed") return "text-muted border-line";
  if (status === "cancelled") return "text-fault border-fault/40";
  return "text-gold border-gold/40"; // draft
}

const card = "glass-soft rounded-2xl";

/** Host dashboard: the overview a host lands on in the console. */
export function HostHomeLetterpressScreen() {
  const { users, currentUser, venueOf, soldOf, capacityOf, artists } = useStore();

  /*
   * `getMyEvents()`, not the store's `events`.
   *
   * The store holds the public catalogue: every published event on the
   * platform. This screen once read straight from it, so a host in Mysuru saw
   * a Bengaluru venue's nights among their own, and "Revenue (est.)" was the
   * sum of every ticket Showzy had ever sold, presented as theirs. The Events
   * screen has always called the scoped endpoint.
   */
  const [events, setEvents] = useState<NaadaEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyEvents()
      .then((r) => setEvents(r.results.map(adaptEvent)))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = [...events]
    .filter((e) => (e.status === "published" || e.status === "live") && e.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date));

  const nextUp = upcoming[0] ?? null;
  const nextVenue = nextUp ? venueOf(nextUp) : null;

  const allRows = [...events].sort((a, b) => {
    const done = (s: string) => (s === "completed" || s === "cancelled" ? 1 : 0);
    return done(a.status) - done(b.status) || a.date.localeCompare(b.date);
  });

  const totalRevenue = events
    .filter((e) => e.status === "completed" || e.status === "published")
    .reduce((sum, e) => sum + soldOf(e) * (e.tiers[0]?.price ?? 0), 0);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const stats = [
    { label: "Upcoming", value: String(upcoming.length) },
    { label: "Artists booked", value: String(new Set(events.flatMap((e) => e.lineup)).size) },
    { label: "Revenue (est.)", value: money(totalRevenue) },
  ];

  const nextSold = nextUp ? soldOf(nextUp) : 0;
  const nextCap = nextUp ? capacityOf(nextUp) : 0;

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Overview"]}>
      {/* Greeting and the three numbers a host checks first */}
      <section className={`${card} flex flex-wrap items-end justify-between gap-x-8 gap-y-5 p-6 md:p-8`}>
        <div className="min-w-0">
          <p className="text-[14px] text-muted">{greeting}</p>
          <h1 className="t-h1 mt-1 break-words">{(currentUser?.full_name ?? users.host.name).split(" ")[0]}</h1>
          <p className="mt-1.5 truncate text-[13px] text-muted">{currentUser?.email ?? users.host.org}</p>
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          {stats.map(({ label, value }) => (
            <div key={label}>
              <dd className="text-[clamp(24px,3vw,34px)] font-bold leading-none tabular-nums text-paper">{value}</dd>
              <dt className="mt-1.5 text-[13px] text-muted">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Next up */}
        <section className={`${card} overflow-hidden`} aria-label="Next up">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--glass-border-soft)] px-5 py-3.5">
            <span className="flex items-center gap-2 text-[13px] font-semibold text-live">
              <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-live" />
              Next up
            </span>
            {nextUp && (
              <span className="text-[13px] text-muted">
                {dateListing(nextUp.date)} · {nextUp.time}
              </span>
            )}
          </div>

          {nextUp ? (
            <div className="p-5">
              <h2 className="text-[20px] font-bold leading-snug text-paper">{nextUp.name}</h2>
              <p className="mt-1 text-[14px] text-muted">
                {nextVenue?.name} · {nextVenue?.area}
              </p>

              <div className="mt-5">
                <div className="flex items-baseline justify-between text-[13px]">
                  <span className="text-muted">Sold</span>
                  <span className="font-semibold tabular-nums text-paper">
                    {nextSold}/{nextCap}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-paper/10">
                  <div
                    className="h-full rounded-full bg-signal"
                    style={{ width: `${nextCap > 0 ? Math.min(100, (nextSold / nextCap) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to={`/host/events/${nextUp.id}`}
                  className="grid min-h-11 flex-1 place-items-center rounded-md bg-signal px-5 text-[14px] font-semibold text-white no-underline hover:bg-[#d4503a]"
                >
                  Manage event
                </Link>
                <Link
                  to={`/e/${nextUp.id}`}
                  className="grid min-h-11 place-items-center rounded-md border border-[var(--glass-border)] px-5 text-[14px] font-semibold text-paper no-underline hover:border-paper/50"
                >
                  Public page
                </Link>
              </div>
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <p className="text-[15px] font-semibold text-paper">Nothing coming up</p>
              <p className="mt-1 text-[14px] text-muted">Publish a night and it shows up here.</p>
              <Link
                to="/host/events/new"
                className="mt-4 inline-grid min-h-11 place-items-center rounded-md bg-signal px-5 text-[14px] font-semibold text-white no-underline hover:bg-[#d4503a]"
              >
                Create an event
              </Link>
            </div>
          )}
        </section>

        {/* Quick actions */}
        <div className="flex flex-col gap-3">
          <Link
            to="/host/events"
            className="flex items-center gap-4 rounded-2xl bg-signal p-5 text-white no-underline transition-colors hover:bg-[#d4503a]"
          >
            <CalendarPlus className="size-6 shrink-0" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[16px] font-bold">Publish an event</span>
              <span className="block text-[13px] text-white/80">Create, set ticket tiers, go live</span>
            </span>
            <ChevronRight className="ml-auto size-4 shrink-0 opacity-70" aria-hidden />
          </Link>

          <Link
            to="/host/artists"
            className={`${card} flex items-center gap-4 p-5 text-paper no-underline transition-transform duration-300 hover:-translate-y-0.5`}
          >
            <Users className="size-6 shrink-0 text-signal" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[16px] font-bold">Find artists</span>
              <span className="block text-[13px] text-muted">{artists.length} artists · browse by genre</span>
            </span>
            <ChevronRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden />
          </Link>

          <Link
            to="/host/bookings"
            className={`${card} flex items-center gap-4 p-5 text-paper no-underline transition-transform duration-300 hover:-translate-y-0.5`}
          >
            <Handshake className="size-6 shrink-0 text-signal" strokeWidth={1.6} aria-hidden />
            <span className="min-w-0">
              <span className="block text-[16px] font-bold">Bookings</span>
              <span className="block text-[13px] text-muted">Offers, counters and confirmations</span>
            </span>
            <ChevronRight className="ml-auto size-4 shrink-0 text-muted" aria-hidden />
          </Link>
        </div>
      </div>

      {/* Your events */}
      <section className="mt-10" aria-label="Your events">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="font-megrim text-[clamp(22px,3vw,30px)] font-normal uppercase leading-tight tracking-[0.02em]">
            Your events
          </h2>
          <Link to="/host/events" className="text-[14px] font-semibold text-signal no-underline hover:underline">
            View all →
          </Link>
        </div>

        {loading ? (
          <div className={`${card} border-dashed px-4 py-10 text-center text-[14px] text-muted`} role="status">
            Loading your events…
          </div>
        ) : allRows.length === 0 ? (
          <div className={`${card} border-dashed px-4 py-10 text-center`}>
            <p className="text-[15px] font-semibold text-paper">No events yet</p>
            <p className="mt-1 text-[14px] text-muted">Your nights will be listed here.</p>
            <Link
              to="/host/events/new"
              className="mt-4 inline-grid min-h-11 place-items-center rounded-md bg-signal px-5 text-[14px] font-semibold text-white no-underline hover:bg-[#d4503a]"
            >
              Create your first event
            </Link>
          </div>
        ) : (
          /* The table wants about 470px and a phone gives it 343, so it scrolls
             sideways inside its own box rather than cutting Sold and Status off. */
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-b border-[var(--glass-border-soft)] text-[13px] text-muted">
                  {["Date", "Event", "Venue", "Sold", "Status"].map((h) => (
                    <th key={h} scope="col" className="px-4 py-3 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allRows.map((ev, i) => {
                  const venue = venueOf(ev);
                  return (
                    <tr
                      key={ev.id}
                      className={i < allRows.length - 1 ? "border-b border-[var(--glass-border-soft)]" : ""}
                    >
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted">{tableDate(ev.date)}</td>
                      <td className="px-4 py-3">
                        <Link
                          to={`/host/events/${ev.id}`}
                          className="font-semibold text-paper no-underline hover:text-signal"
                        >
                          {ev.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted">{venue?.name ?? "—"}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-paper">
                        {soldOf(ev)}/{capacityOf(ev)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[12px] font-semibold capitalize ${statusStyle(ev.status)}`}
                        >
                          {ev.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
