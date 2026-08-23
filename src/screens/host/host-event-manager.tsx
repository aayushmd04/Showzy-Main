import { Link, useParams } from "react-router-dom";
import { ExternalLink, Pencil, ScanLine } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { StateToggle } from "@/components/naada/state-toggle";
import { Button } from "@/components/ui/button";
import { Pill, statusLabel } from "@/components/ui/pill";
import { Poster } from "@/components/naada/poster";
import { useStore } from "@/store/app-store";
import { useBriefComposer } from "@/components/naada/brief-composer";
import type { EventStatus } from "@/data/fixtures";
import { dateListingFull, money } from "@/lib/format";
import { NotFoundScreen } from "../not-found";

const EVENT_STATES: EventStatus[] = ["draft", "published", "live", "completed", "cancelled"];

/** Event manager — the hub each event row opens into. State toggle per Section 9. */
export function HostEventManagerScreen() {
  const { id = "" } = useParams();
  const {
    eventById,
    venueOf,
    artistById,
    bookings,
    applications,
    setApplicationStatus,
    soldOf,
    capacityOf,
    setEventStatus,
    toast,
  } = useStore();
  const { open: openBrief } = useBriefComposer();
  const event = eventById(id);
  if (!event) return <NotFoundScreen />;

  const venue = venueOf(event);
  const sold = soldOf(event);
  const capacity = capacityOf(event);
  const revenue = event.tiers.reduce((sum, t) => sum + t.price * t.sold, 0);
  const eventBookings = bookings.filter((b) => b.eventId === event.id);
  const openApplications = applications.filter(
    (a) => a.eventId === event.id && (a.status === "pending" || a.status === "shortlisted"),
  );

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", event.name]}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="t-h1">{event.name}</h1>
            <Pill>{statusLabel(event.status)}</Pill>
          </div>
          <p className="t-body mt-2 text-muted">
            {venue?.name} · {dateListingFull(event.date)} ·{" "}
            <span className="t-mono">{event.time}</span>
          </p>
        </div>
        <StateToggle
          value={event.status}
          options={EVENT_STATES}
          onChange={(next) => {
            setEventStatus(event.id, next);
            toast(`Event set to ${next.replace(/_/g, " ")}`);
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link to={`/host/events/${event.id}/edit`} className="btn btn-secondary">
          <Pencil className="size-4" aria-hidden="true" />
          Edit event
        </Link>
        <Link to={`/host/events/${event.id}/door`} className="btn btn-primary">
          <ScanLine className="size-4" aria-hidden="true" />
          Open door scanner
        </Link>
        {event.status !== "draft" && (
          <Link to={`/e/${event.id}`} className="btn btn-secondary">
            <ExternalLink className="size-4" aria-hidden="true" />
            View public page
          </Link>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={`${sold}/${capacity}`} label="Tickets sold" />
        <StatTile value={String(event.checkedIn)} label="Checked in" tone="live" />
        <StatTile value={money(revenue)} label="Gross ticket revenue" />
        <StatTile value={String(event.lineup.length)} label="Artists on the bill" />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="min-w-0">
          <h2 className="t-micro">Ticket tiers</h2>
          <table className="mt-3 w-full border border-line bg-surface text-left">
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="t-micro px-4 py-3">Tier</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Price</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Sold</th>
                <th scope="col" className="t-micro px-4 py-3 text-right">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {event.tiers.map((t) => (
                <tr key={t.name} className="border-b border-line last:border-0">
                  <td className="px-4 py-3 text-[15px]">{t.name}</td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {t.price === 0 ? "FREE" : money(t.price)}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {t.sold}/{t.capacity}
                  </td>
                  <td className="t-mono px-4 py-3 text-right text-[14px]">
                    {money(t.price * t.sold)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="t-micro mt-8">Artist slots</h2>
          {eventBookings.length > 0 ? (
            <ul className="mt-3 divide-y divide-line border border-line bg-surface">
              {eventBookings.map((booking) => {
                const artist = artistById(booking.artistId);
                return (
                  <li key={booking.id}>
                    <Link
                      to={`/bookings/${booking.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 basis-[160px] truncate text-[15px]">
                        {artist?.name}
                      </span>
                      <span className="t-mono shrink-0 text-[14px]">
                        {booking.agreedFee
                          ? money(booking.agreedFee)
                          : money(booking.quotes[booking.quotes.length - 1]?.amount ?? 0)}
                      </span>
                      <Pill>{statusLabel(booking.state)}</Pill>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="t-small mt-3 border border-dashed border-line px-4 py-6 text-muted">
              No artists booked yet. Find one in{" "}
              <Link to="/host/artists" className="link-underline text-paper">
                artist search
              </Link>
              .
            </p>
          )}

          {event.isSeekingArtist && (
            <>
              <h2 className="t-micro mt-8">
                Applications {openApplications.length > 0 && `(${openApplications.length})`}
              </h2>
              {openApplications.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {openApplications.map((application) => {
                    const artist = artistById(application.artistId);
                    if (!artist) return null;
                    return (
                      <li
                        key={application.id}
                        className="flex flex-wrap items-start gap-3 border border-line bg-surface p-3"
                      >
                        <div className="min-w-0 flex-1 basis-[200px]">
                          <p className="text-[15px]">{artist.name}</p>
                          <p className="t-small mt-1 text-muted">{application.message}</p>
                          {application.proposedRate && (
                            <p className="t-mono mt-1 text-[13px] text-brass">
                              {money(application.proposedRate)} proposed
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Pill>{application.status}</Pill>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setApplicationStatus(application.id, "declined");
                                toast(`${artist.name} declined`);
                              }}
                            >
                              Decline
                            </Button>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => {
                                setApplicationStatus(application.id, "shortlisted");
                                openBrief(artist.id, event.id);
                              }}
                            >
                              {application.status === "shortlisted" ? "Send brief" : "Shortlist & reply"}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="t-small mt-3 border border-dashed border-line px-4 py-6 text-muted">
                  No applications yet — this event is listed on the artist gig board.
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <h2 className="t-micro">Poster</h2>
          <div className="mt-3">
            <Poster event={event} />
          </div>
        </div>
      </div>
    </ConsoleShell>
  );
}
