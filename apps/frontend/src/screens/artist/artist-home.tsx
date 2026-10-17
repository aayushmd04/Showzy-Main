import { Link } from "react-router-dom";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { Pill, statusLabel } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { dateListing, money } from "@/lib/format";
import { PLATFORM_FEE_RATE, TDS_RATE } from "@/data/fixtures";
import { bookingEventTitle } from "@/lib/adapters";

/** Section 7.16 — Artist console home. */
export function ArtistHomeScreen() {
  const { bookings, eventById, venueOf } = useStore();

  const openOffers = bookings.filter(
    (b) => b.state === "requested" || b.state === "negotiating",
  );
  const confirmed = bookings.filter((b) => b.state === "accepted" || b.state === "funded");
  const inEscrow = bookings
    .filter((b) => b.state === "funded")
    .reduce((sum, b) => sum + (b.agreedFee ?? 0), 0);
  const paid = bookings
    .filter((b) => b.state === "released")
    .reduce((sum, b) => sum + (b.agreedFee ?? 0), 0);

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Overview"]}>
      <h1 className="t-h1">Overview</h1>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={String(openOffers.length)} label="Open offers" tone="signal" />
        <StatTile
          value={String(confirmed.length)}
          label={confirmed.length === 1 ? "Confirmed gig" : "Confirmed gigs"}
        />
        <StatTile value={money(inEscrow)} label="In escrow" tone="brass" />
        <StatTile value={money(paid)} label="Paid this month" tone="live" />
      </div>

      <p className="t-small mt-6 flex items-center justify-between gap-3 glass-soft rounded-xl p-4 text-muted">
        <span>Hosts with an open slot and a budget post it to the gig board.</span>
        <Link to="/artist/gig-board" className="btn btn-secondary btn-sm shrink-0">
          Browse gig board
        </Link>
      </p>

      <h2 className="t-section mt-10">Upcoming gigs</h2>
      {confirmed.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {confirmed.map((b) => {
            const event = eventById(b.eventId);
            const venue = event ? venueOf(event) : undefined;
            return (
              <li key={b.id}>
                <Link
                  to={`/bookings/${b.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-paper/5"
                >
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="block text-[12px] font-medium tabular-nums tracking-[0.04em] text-muted">
                      {event ? dateListing(event.date) : ""}
                    </span>
                    <span className="block truncate text-[15px] font-semibold">{event?.name ?? bookingEventTitle(b) ?? "Confirmed gig"}</span>
                    <span className="t-small block truncate text-muted">{venue?.name}</span>
                  </span>
                  <span className="tabular-nums font-semibold shrink-0 text-[15px]">{money(b.agreedFee ?? 0)}</span>
                  <Pill>{statusLabel(b.state)}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-8 text-center text-muted">
          Nothing confirmed yet. Offers land in your inbox.
        </p>
      )}

      <p className="t-small mt-6 glass-soft rounded-xl p-4 text-muted">
        You are not charged a Showzy fee: the venue pays {Math.round(PLATFORM_FEE_RATE * 100)}% on top of your
        agreed fee. You receive your fee less {Math.round(TDS_RATE * 100)}% TDS.
      </p>
    </ConsoleShell>
  );
}
