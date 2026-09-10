/**
 * The home page a venue/host lands on at `/` once they sign in.
 *
 * It answers what a host opens Naada to answer: who can I book, how are my
 * nights selling, and what needs a decision from me. Every number is read from
 * the API — sold counts come from the event's own ticket tiers, never from an
 * estimate.
 */
import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";

import { PublicShell } from "@/components/naada/public-shell";
import { Pill, type PillTone } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import {
  eventQuery,
  getAllArtists,
  getAllEvents,
  getEvent,
  getMyEvents,
  type ApiArtist,
  type ApiEvent,
} from "@/lib/api";
import {
  AsyncSection,
  CountTile,
  EmptyBlock,
  ErrorBlock,
  HomeHeader,
  HomeLayout,
  LoadingBlock,
  Section,
  T_H3,
  T_MICRO,
  T_MONO,
  T_SMALL,
  budgetRange,
  greeting,
  isFuture,
  placeLine,
  rupees,
  stampDate,
  stampDateTime,
  useAsync,
} from "./home-kit";
import {
  AWAITING_FUNDING_STATUSES,
  OPEN_ORDER_STATUSES,
  getBookingConversations,
  getBookingOrders,
  getGigApplications,
  type GigApplicationStatus,
} from "./home-data";
import { usePageMeta } from "@/lib/use-meta";

const APPLICATION_TONE: Record<GigApplicationStatus, PillTone> = {
  pending: "brass",
  shortlisted: "signal",
  accepted: "live",
  rejected: "fault",
};

/** An upcoming event plus the sales figures read off its own ticket tiers. */
interface EventSales {
  event: ApiEvent;
  sold: number | null;
  capacity: number | null;
}

function countLabel(loading: boolean, error: string | null, n: number): string {
  if (loading) return "…";
  if (error) return "—";
  return String(n);
}

export function HostHomeLandingScreen() {
  usePageMeta({ title: "Your nights", description: "How your nights are selling, who you can book, and what needs a decision." });
  const { currentUser } = useStore();

  /**
   * The list endpoint carries `seats_left` but not what was sold, so the five
   * soonest events are re-read in detail for their tiers. A detail call that
   * fails leaves that row without a bar rather than taking the section down.
   */
  const fetchMyEvents = useCallback(async (): Promise<EventSales[]> => {
    const list = await getMyEvents();
    const upcoming = list.results
      .filter((e) => isFuture(e.start_datetime) && e.status !== "cancelled")
      .sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));

    const detailed = await Promise.allSettled(
      upcoming.slice(0, 5).map((e) => getEvent(e.id)),
    );

    return upcoming.map((event, i) => {
      const settled = detailed[i];
      if (!settled || settled.status !== "fulfilled") {
        return { event, sold: null, capacity: null };
      }
      const tiers = settled.value.ticket_tiers ?? [];
      if (tiers.length === 0) return { event, sold: null, capacity: null };
      return {
        event,
        sold: tiers.reduce((n, t) => n + (t.sold_quantity ?? 0), 0),
        capacity: tiers.reduce((n, t) => n + (t.total_quantity ?? 0), 0),
      };
    });
  }, []);

  const fetchArtists = useCallback(() => getAllArtists(), []);
  const fetchEvents = useCallback(() => getAllEvents(eventQuery({ upcoming: true })), []);

  const myEvents = useAsync(fetchMyEvents, "load your events");
  const artists = useAsync(fetchArtists, "load artists");
  const applications = useAsync(getGigApplications, "load applications to your events");
  const conversations = useAsync(getBookingConversations, "load your conversations");
  const orders = useAsync(getBookingOrders, "load your bookings");
  const events = useAsync(fetchEvents, "load what's on");

  const pendingApplications = useMemo(
    () => (applications.data?.results ?? []).filter((a) => a.status === "pending"),
    [applications.data],
  );

  const activeConversations = useMemo(
    () =>
      (conversations.data?.results ?? [])
        .filter((c) => c.is_active)
        .sort((a, b) =>
          (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at),
        ),
    [conversations.data],
  );

  const openOrders = useMemo(
    () =>
      (orders.data?.results ?? [])
        .filter((o) => OPEN_ORDER_STATUSES.has(o.status))
        .sort((a, b) => a.performance_date.localeCompare(b.performance_date)),
    [orders.data],
  );

  const unfundedOrders = useMemo(
    () => openOrders.filter((o) => AWAITING_FUNDING_STATUSES.has(o.status)),
    [openOrders],
  );

  const whatsOn = useMemo(() => (events.data ?? []).slice(0, 4), [events.data]);

  const firstName = (currentUser?.full_name ?? "").trim().split(" ")[0];

  return (
    <PublicShell>
      <HomeLayout>
        <HomeHeader
          kicker={`${greeting()} · Host`}
          title={firstName || "Your nights"}
          subtitle="How your nights are selling, who you can book, and what's waiting on a decision."
          actions={
            <>
              <Link to="/host" className="btn btn-secondary">
                Host console
              </Link>
              <Link to="/host/events/new" className="btn btn-primary">
                New event
              </Link>
            </>
          }
        />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CountTile
            to="/host/events"
            value={countLabel(myEvents.loading, myEvents.error, myEvents.data?.length ?? 0)}
            label={myEvents.data?.length === 1 ? "Upcoming night" : "Upcoming nights"}
          />
          <CountTile
            to="/host/events"
            value={countLabel(applications.loading, applications.error, pendingApplications.length)}
            label="Applications to review"
            tone="signal"
          />
          <CountTile
            to="/host/bookings"
            value={countLabel(conversations.loading, conversations.error, activeConversations.length)}
            label="Artists in talks"
          />
          <CountTile
            to="/host/bookings"
            value={countLabel(orders.loading, orders.error, unfundedOrders.length)}
            label="Awaiting escrow"
            tone="gold"
          />
        </div>

        {/* ── Your nights ───────────────────────────────────────────────── */}
        <Section
          title="Your upcoming nights"
          hint="Sold counts come from each event's own ticket tiers."
          action={{ to: "/host/events", label: "All events" }}
        >
          <AsyncSection
            state={myEvents}
            loadingLabel="Loading your events…"
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyBlock
                headline="No nights coming up"
                body="Put a date, a venue and your tiers in, and Naada handles the tickets and the door."
                to="/host/events/new"
                actionLabel="Create an event"
              />
            }
          >
            {(rows) => (
              <ul className="divide-y divide-line border border-line bg-surface">
                {rows.slice(0, 5).map(({ event, sold, capacity }) => {
                  const pct =
                    sold !== null && capacity !== null && capacity > 0
                      ? Math.min(100, Math.round((sold / capacity) * 100))
                      : null;
                  return (
                    <li key={event.id}>
                      <Link
                        to={`/host/events/${event.id}`}
                        className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-4 transition-colors hover:bg-surface-2"
                      >
                        <span className="min-w-0 flex-1 basis-[220px]">
                          <span className={`${T_MICRO} block`}>
                            {stampDateTime(event.start_datetime)}
                          </span>
                          <span className="block truncate text-[15px] text-paper">
                            {event.title}
                          </span>
                          <span className={`${T_SMALL} block truncate text-muted`}>
                            {placeLine(event.venue_name, event.venue_area, event.city_name) ||
                              "Venue to be confirmed"}
                          </span>
                        </span>

                        <span className="w-[168px] shrink-0">
                          {pct !== null ? (
                            <>
                              <span className={`${T_MONO} block text-[13px] text-paper`}>
                                {sold} / {capacity} sold
                              </span>
                              <span
                                className="mt-1.5 block h-[6px] w-full border border-line"
                                role="img"
                                aria-label={`${pct}% of tickets sold`}
                              >
                                <span
                                  className="block h-full bg-signal"
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                            </>
                          ) : (
                            <span className={`${T_SMALL} block text-muted`}>
                              {event.seats_left !== null && event.seats_left !== undefined
                                ? `${event.seats_left} seats left`
                                : "No ticket tiers yet"}
                            </span>
                          )}
                        </span>

                        <Pill tone={event.status === "published" ? "live" : "muted"}>
                          {event.status.replace(/_/g, " ")}
                        </Pill>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncSection>
        </Section>

        {/* ── Needs a decision ──────────────────────────────────────────── */}
        <Section
          title="Needs a decision"
          hint="Artists who applied to your events, and threads already in progress."
          action={{ to: "/host/bookings", label: "All bookings" }}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className={`${T_MICRO} mb-2`}>Artist applications</p>
              <AsyncSection
                state={applications}
                loadingLabel="Loading applications…"
                isEmpty={(d) => d.results.length === 0}
                empty={
                  <EmptyBlock
                    headline="No applications yet"
                    body="Flag an event as seeking artists and it goes on the gig board, where artists apply with a rate."
                    to="/host/events"
                    actionLabel="Open your events"
                  />
                }
              >
                {(d) => (
                  <ul className="divide-y divide-line border border-line bg-surface">
                    {d.results.slice(0, 5).map((a) => (
                      <li key={a.id}>
                        <Link
                          to={`/host/events/${a.event}`}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2"
                        >
                          <span className="min-w-0 flex-1 basis-[170px]">
                            <span className="block truncate text-[15px] text-paper">
                              {a.artist_name}
                            </span>
                            <span className={`${T_SMALL} block truncate text-muted`}>
                              {a.event_title}
                            </span>
                            <span className={`${T_MICRO} block`}>
                              Applied {stampDate(a.created_at)}
                            </span>
                          </span>
                          {rupees(a.proposed_fee) && (
                            <span className={`${T_MONO} shrink-0 text-[14px] text-gold`}>
                              {rupees(a.proposed_fee)}
                            </span>
                          )}
                          <Pill tone={APPLICATION_TONE[a.status]}>{a.status}</Pill>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </AsyncSection>
            </div>

            <div>
              <p className={`${T_MICRO} mb-2`}>Offers and threads in flight</p>
              <AsyncSection
                state={conversations}
                loadingLabel="Loading your conversations…"
                isEmpty={(d) => d.results.length === 0}
                empty={
                  <EmptyBlock
                    headline="No threads open"
                    body="Find an artist you like and start a conversation — the offer, the counter and the escrow all live in it."
                    to="/host/artists"
                    actionLabel="Find an artist"
                  />
                }
              >
                {(d) => (
                  <ul className="divide-y divide-line border border-line bg-surface">
                    {d.results.slice(0, 5).map((c) => (
                      <li key={c.id} className="px-4 py-3">
                        <Link to="/host/bookings" className="block">
                          <span className="block truncate text-[15px] text-paper">
                            {c.artist_name}
                          </span>
                          <span className={`${T_SMALL} block truncate text-muted`}>
                            {c.latest_message?.content ?? "No messages yet"}
                          </span>
                          <span className={`${T_MICRO} mt-1 block`}>
                            {stampDate(c.last_message_at ?? c.created_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </AsyncSection>
            </div>
          </div>

          {openOrders.length > 0 && (
            <>
              <p className={`${T_MICRO} mb-2 mt-5`}>Bookings still open</p>
              <ul className="divide-y divide-line border border-line bg-surface">
                {openOrders.slice(0, 4).map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/bookings/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 basis-[200px]">
                        <span className={`${T_MICRO} block`}>
                          {stampDate(o.performance_date)}
                        </span>
                        <span className="block truncate text-[15px] text-paper">
                          {o.artist_name}
                        </span>
                        <span className={`${T_SMALL} block truncate text-muted`}>
                          {o.event_title ?? "No event linked"}
                        </span>
                      </span>
                      <span className={`${T_MONO} shrink-0 text-[15px] text-gold`}>
                        {rupees(o.gross_amount)}
                      </span>
                      <Pill>{o.status.replace(/_/g, " ")}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {/* ── Artists ───────────────────────────────────────────────────── */}
        <Section
          title="Artists to book"
          hint="Everyone with a live profile on Naada. Fees are the range they've published."
          action={{ to: "/host/artists", label: "Search artists" }}
        >
          <AsyncSection
            state={artists}
            loadingLabel="Loading artists…"
            isEmpty={(d) => d.length === 0}
            empty={
              <EmptyBlock
                headline="No artist profiles yet"
                body="Nobody has published a profile on Naada yet. Your events can still sell tickets in the meantime."
                to="/host/events/new"
                actionLabel="Create an event"
              />
            }
          >
            {(list) => (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {list.slice(0, 8).map((a: ApiArtist) => {
                  const fee = budgetRange(a.fee_range_min, a.fee_range_max);
                  return (
                    <li key={a.id} className="flex flex-col border border-line bg-surface p-4">
                      <Link
                        to={`/a/${a.id}`}
                        className={`${T_H3} text-paper transition-colors hover:text-signal`}
                      >
                        {a.stage_name}
                      </Link>
                      <p className={`${T_SMALL} mt-1 truncate text-muted`}>
                        {placeLine(
                          a.city_name,
                          a.genres?.map((g) => g.name).join(", ") || null,
                        ) || "No city or genre set"}
                      </p>
                      <p className={`${T_MONO} mt-3 text-[14px] ${fee ? "text-gold" : "text-muted"}`}>
                        {fee ?? "Fee on request"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncSection>
        </Section>

        {/* ── What's on ─────────────────────────────────────────────────── */}
        <Section
          title="What's on across Naada"
          hint="What other rooms in Mysuru and Bengaluru have on — useful when you're picking a date."
          action={{ to: "/whats-on", label: "See everything on" }}
        >
          {events.loading ? (
            <LoadingBlock label="Loading what's on…" />
          ) : events.error ? (
            <ErrorBlock message={events.error} onRetry={events.reload} />
          ) : whatsOn.length === 0 ? (
            <EmptyBlock
              headline="No nights on sale right now"
              body="Nothing is published for the days ahead — a clear run at any date you want."
              to="/host/events/new"
              actionLabel="Create an event"
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {whatsOn.map((e) => (
                <li key={e.id} className="border border-line bg-surface p-4">
                  <p className={T_MICRO}>{stampDateTime(e.start_datetime)}</p>
                  <Link
                    to={`/e/${e.id}`}
                    className={`${T_H3} mt-1 block text-paper transition-colors hover:text-signal`}
                  >
                    {e.title}
                  </Link>
                  <p className={`${T_SMALL} mt-1 truncate text-muted`}>
                    {placeLine(e.venue_name, e.city_name)}
                  </p>
                  <p className={`${T_MONO} mt-2 text-[14px]`}>
                    {e.min_price ? rupees(e.min_price) : <span className="text-live">FREE</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </HomeLayout>
    </PublicShell>
  );
}
