import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Check, Share2 } from "lucide-react";
import { TicketFrame } from "@/components/naada/ticket-frame";
import { PublicShell } from "@/components/naada/public-shell";
import { Poster } from "@/components/naada/poster";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { QuantityStepper } from "@/components/naada/quantity-stepper";
import { VenueMap } from "@/components/naada/venue-map";
import { SaveButton } from "@/components/naada/save-button";
import { EventReviews } from "@/components/naada/event-reviews";
import { ReviewForm } from "@/components/naada/review-form";
import {
  eventHasHappened,
  loadEventDetail,
  type EventDetail,
  type EventReview,
} from "@/components/naada/event-data";
import { useStore } from "@/store/app-store";
import { usePageMeta } from "@/lib/use-meta";
import { adaptEvent } from "@/lib/adapters";
import { clampTickets, maxTickets, minTickets } from "@/lib/quantity";
import { CONVENIENCE_FEE, type NaadaEvent } from "@/data/fixtures";
import { dateBody, dateListingFull, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "./not-found";

/**
 * Section 7.2 — the most important screen in the product. It is the WhatsApp
 * forward, the Instagram bio link and the Google result.
 */
export function EventScreen() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { eventById, venueOf, artistById, startCheckout, toast, role, currentUser } =
    useStore();
  const { open: openAuth } = useAuthSheet();

  /*
   * The events *list* endpoint returns ticket_tiers as null, so the adapter
   * synthesises a single placeholder tier with no server id. An event opened
   * from the store alone therefore had nothing orderable on it — the buy button
   * refused every purchase as "sample data". Only the detail endpoint carries
   * real tiers, so fetch it and prefer it.
   */
  const stored = eventById(id);
  const [raw, setRaw] = useState<EventDetail | null>(null);
  const [detail, setDetail] = useState<NaadaEvent | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setRaw(null);
    if (!id) return;
    // Authenticated when there's a token, so `is_saved` and each review's
    // `is_mine` come back true for the person actually reading the page.
    loadEventDetail(id)
      .then((data) => {
        if (!alive) return;
        setRaw(data);
        setDetail(adaptEvent(data));
      })
      .catch(() => {
        // Offline or unknown id — the stored copy still renders the page.
      });
    return () => {
      alive = false;
    };
  }, [id]);

  const event = detail ?? stored;

  const reviews = raw?.reviews ?? [];
  const myReview = reviews.find((r) => r.is_mine) ?? null;
  // A review is only offered on a night that has already happened. The server
  // decides who counts as a verified attendee.
  const canReview = Boolean(raw && currentUser && eventHasHappened(raw.start_datetime));

  const absorbReview = (saved: EventReview) => {
    setRaw((current) =>
      current
        ? {
            ...current,
            reviews: [
              { ...saved, is_mine: true },
              ...current.reviews.filter((r) => r.id !== saved.id && !r.is_mine),
            ],
          }
        : current,
    );
  };

  const firstAvailable = useMemo(
    () => event?.tiers.find((t) => t.sold < t.capacity)?.name ?? null,
    [event],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [wanted, setWanted] = useState(1);

  // Tiers arrive with the detail fetch, so the default selection has to follow.
  useEffect(() => {
    setSelected((current) => current ?? firstAvailable);
  }, [firstAvailable]);

  // Before the early return — hooks can't sit behind a conditional.
  const metaVenue = event ? venueOf(event) : undefined;
  usePageMeta({
    title: event ? `${event.name} · ${dateListingFull(event.date)}` : undefined,
    description: event
      ? `${dateListingFull(event.date)} at ${metaVenue?.name ?? "a Showzy venue"}${
          metaVenue?.area ? `, ${metaVenue.area}` : ""
        }. ${event.description ?? ""}`.trim()
      : undefined,
    image: (event as { _posterImage?: string } | undefined)?._posterImage,
    type: "event",
  });

  if (!event) return <NotFoundScreen />;

  const venue = venueOf(event);
  const tier = event.tiers.find((t) => t.name === (selected ?? firstAvailable));
  const isFree = event.tiers.every((t) => t.price === 0);
  // How many the buyer can take of the chosen tier (at most 10 an order), and
  // what they have asked for, pulled back inside that range.
  const qty = tier ? clampTickets(wanted, tier) : 1;
  const qtyMax = tier ? maxTickets(tier) : 1;
  const qtyMin = tier ? Math.min(minTickets(tier), qtyMax || 1) : 1;
  const fee = tier && tier.price > 0 ? CONVENIENCE_FEE * qty : 0;
  const total = (tier?.price ?? 0) * qty + fee;
  // `every` is vacuously true on an empty list, so an event listed before its
  // ticket tiers exist was showing "Sold out" and hiding its own buy button.
  // Require a real capacity before calling anything sold out.
  const capacity = event.tiers.reduce((s, t) => s + t.capacity, 0);
  const soldOut = capacity > 0 && event.tiers.every((t) => t.sold >= t.capacity);

  const share = async () => {
    const url = `${window.location.origin}/e/${event.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard is unavailable in some embedded browsers — the toast still tells the story */
    }
    toast("Link copied");
  };

  const getTicket = () => {
    if (!tier) return;
    startCheckout(event.id, tier.name, tier.id, qty);
    if (role === "out") {
      openAuth(isFree ? "Sign in to reserve" : "Sign in to book", {
        allowGuest: true,
        onDone: (outcome) =>
          navigate(outcome === "guest" ? "/checkout/details" : "/checkout/pay"),
      });
    } else {
      navigate("/checkout/pay");
    }
  };

  const ctaLabel = isFree ? "Reserve a spot" : "Get ticket";

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1760px] px-[var(--page-pad)] pb-32 pt-6 md:pb-16 md:pt-10 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
        {/* Left column */}
        <div className="min-w-0">
          <TicketFrame className="p-6 md:p-8">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
            <div className="w-full shrink-0 sm:w-[300px] lg:w-[340px]">
              <Poster event={event} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="t-mono text-[13px] uppercase tracking-[0.08em] text-signal">
                {dateListingFull(event.date)}
              </p>
              <h1 className="t-display mt-2 break-words">{event.name}</h1>
              <p className="t-body mt-4">
                {venue?.name} · {venue?.area}
              </p>
              <p className="t-small mt-1 text-muted">
                Doors <span className="t-mono">{event.time}</span> · {dateBody(event.date)}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {event.genres.map((g) => (
                  <span key={g} className="pill text-muted">
                    {g}
                  </span>
                ))}
                {event.status === "completed" && <Pill>Completed</Pill>}
                {soldOut && <Pill>Sold out</Pill>}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="sm" onClick={share}>
                  <Share2 className="size-4" aria-hidden="true" />
                  Share
                </Button>
                <SaveButton
                  variant="button"
                  size="sm"
                  eventId={event.id}
                  eventName={event.name}
                />
              </div>
            </div>
          </div>
          </TicketFrame>

          {event.lineup.length > 0 && (
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="t-micro">Lineup</h2>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {event.lineup.map((artistId) => {
                const artist = artistById(artistId);
                if (!artist) return null;
                return (
                  <li key={artistId}>
                    <Link
                      to={`/a/${artist.id}`}
                      className="group flex min-h-11 items-center gap-3 py-3 transition-colors hover:text-signal"
                    >
                      <span
                        aria-hidden="true"
                        className="grid size-9 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[14px] font-bold"
                      >
                        {artist.name.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px]">{artist.name}</span>
                        <span className="t-small block truncate text-muted">
                          {artist.genres.join(" · ")}
                        </span>
                      </span>
                      <span aria-hidden="true" className="text-muted group-hover:text-signal">
                        →
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
          )}

          {event.description && (
            <section className="mt-8">
              <h2 className="t-micro">About</h2>
              <p className="t-body mt-3 max-w-[62ch] text-paper/90">{event.description}</p>
            </section>
          )}

          <section className="mt-8">
            <h2 className="t-micro">The venue</h2>
            <div className="mt-3 border border-line bg-surface p-4">
              <p className="t-h3">{venue?.name}</p>
              <p className="t-small mt-1 text-muted">
                {venue?.area} · capacity <span className="t-mono">{venue?.capacity}</span>
              </p>
              {raw?.venue && (
                <VenueMap
                  className="mt-4 border-t border-line pt-4"
                  spot={{
                    name: raw.venue.name,
                    address_line1: raw.venue.address_line1,
                    address_line2: raw.venue.address_line2,
                    pincode: raw.venue.pincode,
                    area_name: raw.venue.area_name ?? venue?.area,
                    city_name: raw.venue.city_name ?? raw.city_name,
                    google_maps_url: raw.venue.google_maps_url,
                  }}
                />
              )}
            </div>
          </section>

          {/* Reviews only make sense once there is something to review, or
              something someone already said. */}
          {raw && (reviews.length > 0 || eventHasHappened(raw.start_datetime)) && (
            <section className="mt-10 border-t border-line pt-6">
              <h2 className="t-micro">What people said</h2>
              <EventReviews reviews={reviews} />

              {canReview && (
                <ReviewForm
                  className="mt-6"
                  eventId={raw.id}
                  existing={myReview}
                  onSaved={absorbReview}
                />
              )}

              {!currentUser && eventHasHappened(raw.start_datetime) && (
                <button
                  type="button"
                  onClick={() => openAuth("Sign in to review this night")}
                  className="t-small mt-4 min-h-11 text-muted underline underline-offset-4 transition-colors hover:text-signal"
                >
                  Were you there? Sign in to add your review.
                </button>
              )}
            </section>
          )}
        </div>

        {/* Right rail — sticky on desktop, fixed bottom bar on mobile */}
        <aside className="mt-8 lg:mt-0">
          <div className="lg:sticky lg:top-24">
            <div className="border border-line bg-surface">
              <div className="border-b border-line px-4 py-3">
                <h2 className="t-micro">{isFree ? "Free entry · RSVP" : "Tickets"}</h2>
              </div>

              <ul className="divide-y divide-line">
                {event.tiers.map((t) => {
                  const isSoldOut = t.sold >= t.capacity;
                  const left = t.capacity - t.sold;
                  const active = t.name === selected;
                  return (
                    <li key={t.name}>
                      <button
                        type="button"
                        disabled={isSoldOut}
                        onClick={() => {
                          setSelected(t.name);
                          setWanted(minTickets(t));
                        }}
                        aria-pressed={active}
                        className={cn(
                          "flex w-full items-center gap-3 px-4 py-4 text-left transition-colors",
                          isSoldOut
                            ? "cursor-not-allowed opacity-55"
                            : "hover:bg-surface-2",
                          active && !isSoldOut && "bg-surface-2",
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn(
                            "grid size-5 shrink-0 place-items-center border",
                            active && !isSoldOut ? "border-signal bg-signal" : "border-line",
                          )}
                        >
                          {active && !isSoldOut && <Check className="size-3.5 text-ink" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-[15px]",
                              isSoldOut && "line-through decoration-muted",
                            )}
                          >
                            {t.name}
                          </span>
                          <span className="t-small block text-muted">
                            {isSoldOut ? (
                              "Sold out"
                            ) : (
                              <>
                                <span className="t-mono">{left}</span> left
                              </>
                            )}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "t-mono shrink-0 text-[15px]",
                            isSoldOut && "line-through decoration-muted",
                          )}
                        >
                          {t.price === 0 ? "FREE" : money(t.price)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {!soldOut && tier && (
                <div className="border-t border-line px-4 py-4">
                  <QuantityStepper
                    className="mb-4"
                    value={qty}
                    min={qtyMin}
                    max={qtyMax}
                    onChange={setWanted}
                    label={isFree ? "Spots" : "Tickets"}
                  />
                  {qty >= qtyMax && qtyMax > 0 && (
                    <p className="t-small -mt-2 mb-3 text-muted">
                      {qtyMax >= 10
                        ? "10 is the most one order can hold."
                        : `That's all that's left, or the most one order can hold (${qtyMax}).`}
                    </p>
                  )}
                  <dl className="space-y-1.5">
                    <div className="flex justify-between gap-4">
                      <dt className="t-small text-muted">
                        Ticket{qty > 1 ? ` × ${qty}` : ""}
                      </dt>
                      <dd className="t-mono text-[14px]">
                        {tier.price === 0 ? "FREE" : money(tier.price * qty)}
                      </dd>
                    </div>
                    {fee > 0 && (
                      <div className="flex justify-between gap-4">
                        <dt className="t-small text-muted">Convenience fee</dt>
                        <dd className="t-mono text-[14px]">{money(fee)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-4 border-t border-line pt-2">
                      <dt className="text-[15px]">Total</dt>
                      <dd className="t-mono text-[17px] font-medium">
                        {total === 0 ? "FREE" : money(total)}
                      </dd>
                    </div>
                  </dl>

                  <Button variant="primary" full className="mt-4" onClick={getTicket}>
                    {ctaLabel}
                  </Button>
                  <p className="t-small mt-3 text-center text-muted">
                    Entry is by QR at the door.
                  </p>
                </div>
              )}

              {soldOut && (
                <div className="border-t border-line px-4 py-5 text-center">
                  <p className="t-body text-muted">Every tier is sold out.</p>
                  <Link to="/" className="btn btn-secondary mt-3 w-full text-center">
                    Browse more events
                  </Link>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Mobile fixed bar */}
      {!soldOut && tier && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--glass-border-soft)] bg-[var(--glass-bar)] px-4 py-3 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="t-small truncate text-muted">
                {tier.name}
                {qty > 1 ? ` × ${qty}` : ""}
              </p>
              <p className="t-mono text-[17px] font-medium">
                {total === 0 ? "FREE" : money(total)}
              </p>
            </div>
            <Button variant="primary" onClick={getTicket} className="shrink-0">
              {ctaLabel}
            </Button>
          </div>
        </div>
      )}
    </PublicShell>
  );
}
