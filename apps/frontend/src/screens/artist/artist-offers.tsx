import { Link, useNavigate } from "react-router-dom";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import { TODAY, dateListing, daysFromToday, money, pluralise } from "@/lib/format";

/** Section 7.17 — Offer inbox. */
export function ArtistOffersScreen() {
  const navigate = useNavigate();
  const { bookings, eventById, venueOf, emptyLists } = useStore();

  const offers = emptyLists
    ? []
    : bookings.filter((b) => b.state === "requested" || b.state === "negotiating");

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Offers"]}>
      <h1 className="t-h1">Offers</h1>

      {offers.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {offers.map((b) => {
            const event = eventById(b.eventId);
            const venue = event ? venueOf(event) : undefined;
            const last = b.quotes[b.quotes.length - 1];
            const mine = last?.by === "artist";
            // Offers lapse four days after the last quote lands.
            const expiresIn = Math.max(
              1,
              daysFromToday(last?.at.slice(0, 10) ?? TODAY) + 4,
            );
            return (
              <li key={b.id} className="px-4 py-4 transition-colors hover:bg-surface-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px]">
                      {event?.name ?? "Event offer"}
                    </p>
                    <p className="t-small mt-0.5 text-muted">
                      {venue?.name}{event ? ` · ${dateListing(event.date)}` : ""}
                    </p>
                    <p className="t-mono mt-2 text-[19px]">
                      {money(last?.amount ?? 0)}
                      {mine && <span className="t-small ml-2 text-muted">(your counter)</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Pill>{b.state === "requested" ? "New offer" : "Negotiating"}</Pill>
                    <span className="t-small text-muted">
                      Expires in {pluralise(expiresIn, "day")}
                    </span>
                    <Link to={`/bookings/${b.id}`} className="btn btn-secondary btn-sm">
                      Open
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="No offers yet"
            body="Venues find artists through search. A complete profile with clips gets found more."
            actionLabel="Finish your profile"
            onAction={() => navigate("/artist/profile")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
