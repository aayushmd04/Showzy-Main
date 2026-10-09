/**
 * The home page an artist lands on at `/` once they sign in.
 *
 * It answers the two questions an artist opens Naada to answer: what can I
 * play, and what is waiting on me. Everything on it is read from the API —
 * where there is no data the section says what to do next rather than
 * inventing a number.
 */
import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, type PillTone } from "@/components/ui/pill";
import { Textarea } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { actionError } from "@/components/naada/api-message";
import {
  eventQuery,
  getAllEvents,
  getMyArtistProfile,
  ApiError,
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
  T_BODY,
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
  LIVE_ORDER_STATUSES,
  applyToOpenGig,
  getBookingConversations,
  getBookingOrders,
  getGigApplications,
  type GigApplicationStatus,
  type HomeGigApplication,
} from "./home-data";
import { usePageMeta } from "@/lib/use-meta";

const APPLICATION_TONE: Record<GigApplicationStatus, PillTone> = {
  pending: "brass",
  shortlisted: "signal",
  accepted: "live",
  rejected: "fault",
};

const APPLICATION_LABEL: Record<GigApplicationStatus, string> = {
  pending: "Applied",
  shortlisted: "Shortlisted",
  accepted: "Accepted",
  rejected: "Not this time",
};

/** Counts render "…" while their call is in flight and "—" when it failed. */
function countLabel(loading: boolean, error: string | null, n: number): string {
  if (loading) return "…";
  if (error) return "—";
  return String(n);
}

export function ArtistHomeLandingScreen() {
  usePageMeta({ title: "Your gigs", description: "Open gigs you can apply to, and everything waiting on you." });
  const { currentUser, toast } = useStore();

  const fetchEvents = useCallback(
    () => getAllEvents(eventQuery({ upcoming: true })),
    [],
  );
  /** A missing artist profile is a real state, not a failure — it becomes the nudge. */
  const fetchProfile = useCallback(async (): Promise<ApiArtist | null> => {
    try {
      return await getMyArtistProfile();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return null;
      throw err;
    }
  }, []);

  const events = useAsync(fetchEvents, "load what's on");
  const applications = useAsync(getGigApplications, "load your applications");
  const orders = useAsync(getBookingOrders, "load your confirmed gigs");
  const conversations = useAsync(getBookingConversations, "load your conversations");
  const profile = useAsync(fetchProfile, "load your artist profile");

  const openGigs = useMemo(
    () => (events.data ?? []).filter((e) => e.is_seeking_artists),
    [events.data],
  );
  const whatsOn = useMemo(() => (events.data ?? []).slice(0, 4), [events.data]);

  const applicationByEvent = useMemo(() => {
    const map = new Map<string, HomeGigApplication>();
    for (const a of applications.data?.results ?? []) map.set(a.event, a);
    return map;
  }, [applications.data]);

  const pendingApplications = useMemo(
    () =>
      (applications.data?.results ?? []).filter(
        (a) => a.status === "pending" || a.status === "shortlisted",
      ),
    [applications.data],
  );

  const confirmedGigs = useMemo(
    () =>
      (orders.data?.results ?? [])
        .filter((o) => LIVE_ORDER_STATUSES.has(o.status) && isFuture(o.performance_date))
        .sort((a, b) => a.performance_date.localeCompare(b.performance_date)),
    [orders.data],
  );

  const activeConversations = useMemo(
    () =>
      (conversations.data?.results ?? [])
        .filter((c) => c.is_active)
        .sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at)),
    [conversations.data],
  );

  const gaps = useMemo(() => profileGaps(profile.data), [profile.data]);

  /* ── Apply ───────────────────────────────────────────────────────────── */

  const [applyTo, setApplyTo] = useState<ApiEvent | null>(null);
  const [rate, setRate] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  const startApply = (event: ApiEvent) => {
    setApplyTo(event);
    setRate(String(Math.round(Number(event.performance_budget_min ?? profile.data?.fee_range_min ?? 0)) || ""));
    setNote("");
  };

  const submitApply = async () => {
    if (!applyTo) return;
    setSending(true);
    try {
      await applyToOpenGig({
        event: applyTo.id,
        proposed_fee: Number(rate) || undefined,
        note: note.trim() || undefined,
      });
      toast(`Applied to ${applyTo.title}`, "success");
      setApplyTo(null);
      applications.reload();
    } catch (err) {
      toast(actionError(err, "send that application"), "fault");
    } finally {
      setSending(false);
    }
  };

  const firstName = (currentUser?.full_name ?? "").trim().split(" ")[0];
  const stageName = profile.data?.stage_name?.trim();

  return (
    <PublicShell>
      <HomeLayout>
        <HomeHeader
          kicker={`${greeting()} · Artist`}
          title={stageName || firstName || "Your gigs"}
          subtitle="Open slots you can apply to, and everything currently waiting on you."
          actions={
            <>
              <Link to="/artist" className="btn btn-secondary">
                Artist console
              </Link>
              <Link to="/whats-on" className="btn btn-secondary">
                Browse what's on
              </Link>
            </>
          }
        />

        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <CountTile
            to="/artist/gig-board"
            value={countLabel(events.loading, events.error, openGigs.length)}
            label={openGigs.length === 1 ? "Open gig" : "Open gigs"}
            tone="gold"
          />
          <CountTile
            to="/artist/gig-board"
            value={countLabel(applications.loading, applications.error, pendingApplications.length)}
            label="Applications open"
          />
          <CountTile
            to="/artist/offers"
            value={countLabel(conversations.loading, conversations.error, activeConversations.length)}
            label="Venues in talks"
            tone="signal"
          />
          <CountTile
            to="/artist/gigs"
            value={countLabel(orders.loading, orders.error, confirmedGigs.length)}
            label={confirmedGigs.length === 1 ? "Confirmed gig" : "Confirmed gigs"}
          />
        </div>

        {/* ── Profile nudge ─────────────────────────────────────────────── */}
        {profile.error ? (
          <div className="mt-6">
            <ErrorBlock message={profile.error} onRetry={profile.reload} />
          </div>
        ) : (
          !profile.loading &&
          gaps.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 glass-soft rounded-xl p-4 md:p-5">
              <div className="min-w-0">
                <p className={`${T_H3} text-paper`}>
                  {profile.data ? "Your profile is what gets you booked" : "You don't have an artist profile yet"}
                </p>
                <p className={`${T_SMALL} mt-1 text-muted`}>
                  {profile.data ? "Still missing: " : "Hosts search by city, genre and fee. Add: "}
                  {gaps.join(", ")}.
                </p>
              </div>
              <Link to="/artist/profile" className="btn btn-primary shrink-0">
                {profile.data ? "Finish profile" : "Create profile"}
              </Link>
            </div>
          )
        )}

        {/* ── Open gigs ─────────────────────────────────────────────────── */}
        <Section
          title="Open gigs you can apply to"
          hint="Hosts flag an event as seeking artists when they have a date and a budget but no one booked."
          action={{ to: "/artist/gig-board", label: "Gig board" }}
        >
          <AsyncSection
            state={events}
            loadingLabel="Loading open gigs…"
            isEmpty={() => openGigs.length === 0}
            empty={
              <EmptyBlock
                headline="No open slots right now"
                body="Nothing on Naada is seeking artists today. Keep your profile sharp — hosts also reach out directly."
                to="/artist/profile"
                actionLabel="Go to your profile"
              />
            }
          >
            {() => (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openGigs.slice(0, 6).map((event) => {
                  const mine = applicationByEvent.get(event.id);
                  const budget = budgetRange(
                    event.performance_budget_min,
                    event.performance_budget_max,
                  );
                  return (
                    <li
                      key={event.id}
                      className="flex flex-col glass-soft rounded-xl p-4 md:p-5"
                    >
                      <p className={T_MICRO}>{stampDateTime(event.start_datetime)}</p>
                      <Link
                        to={`/e/${event.id}`}
                        className={`${T_H3} mt-1 text-paper transition-colors hover:text-signal`}
                      >
                        {event.title}
                      </Link>
                      <p className={`${T_SMALL} mt-1 text-muted`}>
                        {placeLine(event.venue_name, event.venue_area, event.city_name) ||
                          "Venue to be confirmed"}
                      </p>
                      <p className={`${T_MONO} mt-3 text-[14px] ${budget ? "text-gold" : "text-muted"}`}>
                        {budget ?? "No budget published"}
                      </p>
                      <div className="mt-4 flex items-center gap-2">
                        {mine ? (
                          <Pill tone={APPLICATION_TONE[mine.status]}>
                            {APPLICATION_LABEL[mine.status]}
                          </Pill>
                        ) : (
                          <Button size="sm" variant="primary" onClick={() => startApply(event)}>
                            Apply
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </AsyncSection>
        </Section>

        {/* ── Waiting on you ────────────────────────────────────────────── */}
        <Section
          title="Waiting on you"
          hint="Applications you've sent and venues already talking to you."
          action={{ to: "/artist/offers", label: "All offers" }}
        >
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div>
              <p className={`${T_MICRO} mb-2`}>Your applications</p>
              <AsyncSection
                state={applications}
                loadingLabel="Loading your applications…"
                isEmpty={(d) => d.results.length === 0}
                empty={
                  <EmptyBlock
                    headline="You haven't applied to anything yet"
                    body="Applying puts your rate and a short note in front of the host running the night."
                    to="/artist/gig-board"
                    actionLabel="Open the gig board"
                  />
                }
              >
                {(d) => (
                  <ul className="divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
                    {d.results.slice(0, 5).map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                      >
                        <span className="min-w-0 flex-1 basis-[180px]">
                          <Link
                            to={`/e/${a.event}`}
                            className="block truncate text-[15px] text-paper transition-colors hover:text-signal"
                          >
                            {a.event_title}
                          </Link>
                          <span className={`${T_MICRO} block`}>
                            Sent {stampDate(a.created_at)}
                          </span>
                        </span>
                        {rupees(a.proposed_fee) && (
                          <span className={`${T_MONO} shrink-0 text-[14px] text-gold`}>
                            {rupees(a.proposed_fee)}
                          </span>
                        )}
                        <Pill tone={APPLICATION_TONE[a.status]}>
                          {APPLICATION_LABEL[a.status]}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </AsyncSection>
            </div>

            <div>
              <p className={`${T_MICRO} mb-2`}>Venues in conversation</p>
              <AsyncSection
                state={conversations}
                loadingLabel="Loading your conversations…"
                isEmpty={(d) => d.results.length === 0}
                empty={
                  <EmptyBlock
                    headline="No conversations open"
                    body="A host starts a thread here when they want to book you. Offers and counters happen inside it."
                    to="/artist/offers"
                    actionLabel="Go to offers"
                  />
                }
              >
                {(d) => (
                  <ul className="divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
                    {d.results.slice(0, 5).map((c) => (
                      <li key={c.id} className="px-4 py-3">
                        <Link to="/artist/offers" className="block">
                          <span className="block truncate text-[15px] text-paper">
                            {c.organizer_name}
                          </span>
                          <span className={`${T_SMALL} block truncate text-muted`}>
                            {c.latest_message?.content ?? "No messages yet"}
                          </span>
                          <span className={`${T_MICRO} mt-1 block`}>
                            {c.last_message_at ? stampDate(c.last_message_at) : stampDate(c.created_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </AsyncSection>
            </div>
          </div>
        </Section>

        {/* ── Confirmed gigs ────────────────────────────────────────────── */}
        <Section
          title="Confirmed gigs"
          hint="Bookings with agreed terms. Naada takes no fee from artists — the venue pays it."
          action={{ to: "/artist/gigs", label: "All gigs" }}
        >
          <AsyncSection
            state={orders}
            loadingLabel="Loading your confirmed gigs…"
            isEmpty={() => confirmedGigs.length === 0}
            empty={
              <EmptyBlock
                headline="Nothing confirmed yet"
                body="A gig lands here once you and the host agree terms and the fee is held in escrow."
                to="/artist/gig-board"
                actionLabel="Find an open gig"
              />
            }
          >
            {() => (
              <ul className="divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
                {confirmedGigs.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <Link
                      to={`/bookings/${o.id}`}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 transition-colors hover:bg-surface-2"
                    >
                      <span className="min-w-0 flex-1 basis-[200px]">
                        <span className={`${T_MICRO} block`}>
                          {stampDate(o.performance_date)}
                        </span>
                        <span className="block truncate text-[15px] text-paper">
                          {o.event_title ?? o.organizer_name}
                        </span>
                        <span className={`${T_SMALL} block truncate text-muted`}>
                          {o.organizer_name}
                        </span>
                      </span>
                      <span className={`${T_MONO} shrink-0 text-[15px] text-gold`}>
                        {rupees(o.artist_payout) ?? rupees(o.gross_amount)}
                      </span>
                      <Pill>{o.status.replace(/_/g, " ")}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </AsyncSection>
        </Section>

        {/* ── What's on ─────────────────────────────────────────────────── */}
        <Section
          title="What's on"
          hint="You keep full access to everything on Naada — it just isn't the first thing you see any more."
          action={{ to: "/whats-on", label: "See everything on" }}
        >
          {events.loading ? (
            <LoadingBlock label="Loading what's on…" />
          ) : events.error ? (
            <ErrorBlock message={events.error} onRetry={events.reload} />
          ) : whatsOn.length === 0 ? (
            <EmptyBlock
              headline="No nights on sale right now"
              body="Nothing is published for the days ahead. New nights go up here as hosts announce them."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {whatsOn.map((e) => (
                <li key={e.id} className="glass-soft rounded-xl p-4 md:p-5">
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

        <Modal
          open={Boolean(applyTo)}
          onClose={() => setApplyTo(null)}
          title={applyTo ? `Apply to ${applyTo.title}` : "Apply"}
        >
          {applyTo && (
            <>
              <p className={`${T_SMALL} text-muted`}>
                {placeLine(applyTo.venue_name, applyTo.venue_area, applyTo.city_name)} ·{" "}
                {stampDateTime(applyTo.start_datetime)}
              </p>
              {budgetRange(applyTo.performance_budget_min, applyTo.performance_budget_max) && (
                <p className={`${T_SMALL} mt-2 text-muted`}>
                  Host's budget:{" "}
                  <span className={`${T_MONO} text-gold`}>
                    {budgetRange(applyTo.performance_budget_min, applyTo.performance_budget_max)}
                  </span>
                </p>
              )}

              <label htmlFor="home-apply-rate" className={`${T_MICRO} mb-2 mt-4 block`}>
                Your rate
              </label>
              <div className="flex items-stretch gap-2">
                <span
                  className={`${T_MONO} grid w-11 place-items-center border border-line bg-ink text-[15px] text-muted`}
                >
                  ₹
                </span>
                <input
                  id="home-apply-rate"
                  inputMode="numeric"
                  value={rate}
                  onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
                  className={`field ${T_MONO} flex-1`}
                />
              </div>

              <label htmlFor="home-apply-note" className={`${T_MICRO} mb-2 mt-4 block`}>
                Note to the host
              </label>
              <Textarea
                id="home-apply-note"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you'd play, and how long a set you're up for."
              />

              <Button
                variant="primary"
                full
                className="mt-5"
                onClick={submitApply}
                disabled={!rate || sending}
              >
                {sending ? "Sending…" : "Send application"}
              </Button>
              <p className={`${T_BODY} mt-3 text-center text-muted`}>
                The host sees your rate, your note and your profile.
              </p>
            </>
          )}
        </Modal>
      </HomeLayout>
    </PublicShell>
  );
}

/**
 * What a host looks for and this profile hasn't got. Only fields the API
 * actually returns are checked, so the list is never a guess.
 */
function profileGaps(profile: ApiArtist | null): string[] {
  if (!profile) return ["a stage name", "your city", "your genres", "a fee range"];
  const gaps: string[] = [];
  if (!profile.bio?.trim()) gaps.push("a bio");
  if (!profile.genres?.length) gaps.push("your genres");
  if (!profile.city_name) gaps.push("your city");
  if (!profile.fee_range_min && !profile.fee_range_max) gaps.push("a fee range");
  if (!profile.primary_photo && !profile.profile_image) gaps.push("a photo");
  return gaps;
}
