import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Pill, statusLabel } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import { dateListing, money } from "@/lib/format";

/** Every booking that made it past negotiation, from the artist's side. */
export function ArtistGigsScreen() {
  const navigate = useNavigate();
  const { bookings, eventById, venueOf, emptyLists } = useStore();

  const gigs = emptyLists
    ? []
    : bookings.filter((b) =>
        ["accepted", "funded", "performed", "released"].includes(b.state),
      );

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Gigs"]}>
      <h1 className="t-h1">Gigs</h1>

      {gigs.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {gigs.map((b) => {
            const event = eventById(b.eventId);
            const venue = event ? venueOf(event) : undefined;
            return (
              <li key={b.id}>
                <Link
                  to={`/bookings/${b.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 basis-[200px]">
                    <span className="t-mono block text-[11px] uppercase tracking-[0.08em] text-muted">
                      {event ? dateListing(event.date) : ""}
                    </span>
                    <span className="block truncate text-[15px]">{event?.name}</span>
                    <span className="t-small block truncate text-muted">{venue?.name}</span>
                  </span>
                  <span className="t-mono shrink-0 text-[15px]">{money(b.agreedFee ?? 0)}</span>
                  <Pill>{statusLabel(b.state)}</Pill>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="No gigs booked yet"
            body="Accept an offer and it moves here with its fee and escrow status."
            actionLabel="See your offers"
            onAction={() => navigate("/artist/offers")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
