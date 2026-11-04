import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Accessibility,
  Armchair,
  Beer,
  CarFront,
  CheckCircle2,
  Clock,
  Film,
  Snowflake,
  Speaker,
  Star,
  UtensilsCrossed,
  Users,
} from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Avatar } from "@/components/naada/avatar";
import { VenueMap } from "@/components/naada/venue-map";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { ApiError, followVenue, getVenuePage, type ApiVenueNight, type ApiVenuePage } from "@/lib/api";
import { mediaUrl } from "@/lib/adapters";
import { usePageMeta } from "@/lib/use-meta";
import { actionError } from "@/components/naada/api-message";
import { dateListing, dateListingFull } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "./not-found";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const FACILITIES: Array<[keyof ApiVenuePage, string, typeof Beer]> = [
  ["has_sound_system", "Sound system", Speaker],
  ["has_ac", "Air-conditioned", Snowflake],
  ["has_bar", "Bar", Beer],
  ["has_restaurant", "Food", UtensilsCrossed],
  ["has_parking", "Parking", CarFront],
  ["is_accessible", "Step-free access", Accessibility],
  ["has_projector", "Projector", Film],
];

const hhmm = (t: string) => t.slice(0, 5);
const nameOf = (v: string | { name?: string } | undefined) => (typeof v === "string" ? v : (v?.name ?? ""));

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn("size-4", n <= Math.round(value) ? "fill-gold text-gold" : "text-line")} />
      ))}
    </span>
  );
}

function NightCard({ night }: { night: ApiVenueNight }) {
  return (
    <Link
      to={`/e/${night.id}`}
      className="glass-soft group flex gap-3 overflow-hidden rounded-xl p-2.5 text-paper no-underline transition-transform duration-300 hover:-translate-y-0.5"
    >
      <div className="size-20 shrink-0 overflow-hidden rounded-lg bg-surface-2">
        <Avatar src={mediaUrl(night.poster_image)} name={night.title} rounded="rounded-lg" />
      </div>
      <div className="min-w-0 self-center">
        <p className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">{dateListing(night.start_datetime.slice(0, 10))}</p>
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug">{night.title}</p>
        {night.genres[0] && <p className="mt-0.5 text-[13px] text-muted">{night.genres.slice(0, 2).join(" · ")}</p>}
      </div>
    </Link>
  );
}

/**
 * A venue's own page: the room, what is on there, what it has hosted, and what
 * people who went said. How to reach the venue directly, who owns it and what
 * it charges are not part of the public page — the server never sends them.
 */
export function VenueProfileScreen() {
  const { slug = "" } = useParams();
  const { currentUser, toast } = useStore();
  const { open: openAuth } = useAuthSheet();

  const [venue, setVenue] = useState<ApiVenuePage | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [error, setError] = useState("");
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [followError, setFollowError] = useState("");
  const [active, setActive] = useState(0);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const v = await getVenuePage(slug);
      setVenue(v);
      setFollowing(v.is_following);
      setFollowers(v.follower_count);
      setActive(0);
      setState("ready");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setState("missing");
      else {
        setError(actionError(err, "load this venue"));
        setState("error");
      }
    }
  }, [slug, currentUser?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  usePageMeta({
    title: venue?.name,
    description: venue ? [venue.tagline, venue.description].filter(Boolean).join(" — ").slice(0, 300) || undefined : undefined,
    image: mediaUrl(venue?.photos?.[0]?.image ?? venue?.primary_photo),
  });

  const send = async (target: ApiVenuePage, next: boolean) => {
    setBusy(true);
    setFollowError("");
    setFollowing(next);
    setFollowers((n) => Math.max(0, n + (next ? 1 : -1)));
    try {
      const res = await followVenue(target.slug, next);
      setFollowing(res.following);
      setFollowers(res.follower_count);
      toast(res.following ? `Following ${target.name}` : `Unfollowed ${target.name}`);
    } catch (err) {
      setFollowing(!next);
      setFollowers((n) => Math.max(0, n + (next ? -1 : 1)));
      setFollowError(actionError(err, "follow this venue"));
    } finally {
      setBusy(false);
    }
  };

  const toggleFollow = () => {
    if (!venue || busy) return;
    const next = !following;
    if (!currentUser) {
      openAuth(`Sign in to follow ${venue.name}`, {
        onDone: (outcome) => {
          if (outcome === "authed") void send(venue, next);
        },
      });
      return;
    }
    void send(venue, next);
  };

  if (state === "missing") return <NotFoundScreen />;

  if (state !== "ready" || !venue) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-[1080px] px-[var(--page-pad)] py-10">
          {state === "loading" ? (
            <div className="animate-pulse space-y-4" role="status" aria-label="Loading this venue">
              <div className="aspect-[16/7] rounded-2xl bg-paper/10" />
              <div className="h-8 w-1/2 rounded bg-paper/10" />
              <div className="h-4 w-1/3 rounded bg-paper/10" />
            </div>
          ) : (
            <div className="glass-soft mx-auto max-w-[42ch] rounded-xl p-6 text-center">
              <p className="t-body">{error}</p>
              <Button variant="primary" className="mt-4" onClick={() => void load()}>
                Try again
              </Button>
            </div>
          )}
        </div>
      </PublicShell>
    );
  }

  const photos = venue.photos ?? [];
  const main = photos[active] ?? photos[0];
  const area = nameOf(venue.area) || venue.area_name || "";
  const city = nameOf(venue.city) || venue.city_name || "";
  const facilities = FACILITIES.filter(([key]) => Boolean(venue[key]));
  const hours = (venue.hours ?? []).slice().sort((a, b) => a.day_of_week - b.day_of_week);

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1080px] px-[var(--page-pad)] py-8 md:py-10">
        {/* The room */}
        <div className="overflow-hidden rounded-2xl border border-[var(--glass-border-soft)] bg-surface-2">
          <div className="aspect-[16/8]">
            <Avatar src={mediaUrl(main?.image ?? venue.primary_photo)} name={venue.name} rounded="rounded-none" />
          </div>
        </div>
        {photos.length > 1 && (
          <ul className="mt-2 flex gap-2 overflow-x-auto pb-1" aria-label="More photos of the room">
            {photos.map((p, i) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show photo ${i + 1}`}
                  aria-pressed={i === active}
                  className={cn(
                    "size-16 overflow-hidden rounded-lg border-2 transition-colors",
                    i === active ? "border-signal" : "border-transparent opacity-70 hover:opacity-100",
                  )}
                >
                  <img src={mediaUrl(p.image) ?? p.image} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <header className="mt-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-megrim break-words text-[clamp(30px,5vw,48px)] font-normal uppercase leading-none">
              {venue.name}
              {venue.is_verified && (
                <CheckCircle2 className="ml-2 inline size-5 align-middle text-live" aria-label="Verified by Showzy" />
              )}
            </h1>
            {venue.tagline && <p className="mt-2 max-w-[60ch] text-[16px] text-muted">{venue.tagline}</p>}
            <p className="t-small mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
              {(area || city) && <span>{[area, city].filter(Boolean).join(", ")}</span>}
              {venue.capacity ? (
                <span className="inline-flex items-center gap-1.5">
                  <Armchair className="size-3.5" aria-hidden="true" />
                  <span className="tabular-nums">{venue.capacity}</span> seats
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1.5">
                <Users className="size-3.5" aria-hidden="true" />
                <span className="tabular-nums">{followers}</span> {followers === 1 ? "follower" : "followers"}
              </span>
              {venue.avg_rating !== null && (
                <span className="inline-flex items-center gap-1.5">
                  <Stars value={venue.avg_rating} />
                  <span className="tabular-nums">{venue.avg_rating.toFixed(1)}</span>
                  <span>({venue.review_count})</span>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2">
            <Button onClick={toggleFollow} disabled={busy} aria-pressed={following} aria-label={following ? `Unfollow ${venue.name}` : `Follow ${venue.name}`}>
              {following ? "Following" : "Follow"}
            </Button>
            {followError && (
              <p className="t-small max-w-[26ch] text-fault" role="alert">
                {followError}
              </p>
            )}
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <div className="min-w-0 space-y-10">
            <section aria-label="Upcoming nights">
              <h2 className="t-micro">On at {venue.name}</h2>
              {venue.upcoming_events.length > 0 ? (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {venue.upcoming_events.map((n) => (
                    <li key={n.id}>
                      <NightCard night={n} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-small mt-3 text-muted">Nothing announced yet. Follow the venue to hear first.</p>
              )}
            </section>

            {venue.past_events.length > 0 && (
              <section aria-label="Hosted before">
                <h2 className="t-micro">Hosted here</h2>
                <ul className="glass-soft mt-3 divide-y divide-[var(--glass-border-soft)] overflow-hidden rounded-xl">
                  {venue.past_events.map((n) => (
                    <li key={n.id}>
                      <Link to={`/e/${n.id}`} className="flex min-h-11 items-center gap-3 px-4 py-3 transition-colors hover:bg-paper/5">
                        <span className="t-mono w-[5.5rem] shrink-0 text-[12px] text-muted">{dateListingFull(n.start_datetime.slice(0, 10))}</span>
                        <span className="min-w-0 flex-1 truncate text-[15px]">{n.title}</span>
                        {n.genres[0] && <Pill tone="muted">{n.genres[0]}</Pill>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-label="What people said">
              <h2 className="t-micro">What people said</h2>
              {venue.recent_reviews.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {venue.recent_reviews.map((r) => (
                    <li key={r.id} className="glass-soft rounded-xl p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[15px] font-semibold">
                          {r.reviewer_name}
                          {r.is_verified_attendee && <span className="t-small ml-2 font-normal text-live">Was there</span>}
                        </p>
                        <Stars value={r.rating} />
                      </div>
                      {r.comment && <p className="t-body mt-2 text-paper/90">{r.comment}</p>}
                      <p className="t-small mt-2 text-muted">After {r.event_title}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="t-small mt-3 text-muted">No reviews yet. People who go to a night here can review it afterwards.</p>
              )}
            </section>
          </div>

          <aside className="space-y-4">
            {venue.description && (
              <section className="glass-soft rounded-xl p-4">
                <h2 className="t-micro">About</h2>
                <p className="t-body mt-2 whitespace-pre-line text-paper/90">{venue.description}</p>
              </section>
            )}

            <section className="glass-soft rounded-xl p-4">
              <h2 className="t-micro">Find it</h2>
              <VenueMap
                className="mt-2"
                spot={{
                  name: venue.name,
                  address_line1: venue.address_line1,
                  address_line2: venue.address_line2,
                  pincode: venue.pincode,
                  area_name: area,
                  city_name: city,
                  google_maps_url: venue.google_maps_url,
                }}
              />
            </section>

            {facilities.length > 0 && (
              <section className="glass-soft rounded-xl p-4">
                <h2 className="t-micro">The room</h2>
                <ul className="mt-2 grid grid-cols-1 gap-2">
                  {venue.stage_type && (
                    <li className="t-small text-muted">
                      {venue.stage_type === "both" ? "Indoor & outdoor stage" : `${venue.stage_type[0].toUpperCase()}${venue.stage_type.slice(1)} stage`}
                    </li>
                  )}
                  {facilities.map(([key, label, Icon]) => (
                    <li key={key} className="flex items-center gap-2 text-[14px]">
                      <Icon className="size-4 shrink-0 text-gold" aria-hidden="true" />
                      {label}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {hours.length > 0 && (
              <section className="glass-soft rounded-xl p-4">
                <h2 className="t-micro flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden="true" /> Opening hours
                </h2>
                <dl className="mt-2 space-y-1">
                  {hours.map((h) => (
                    <div key={h.day_of_week} className="flex justify-between gap-3 text-[14px]">
                      <dt className="text-muted">{DAYS[h.day_of_week]}</dt>
                      <dd className="tabular-nums">{h.is_closed ? "Closed" : `${hhmm(h.open_time)}–${hhmm(h.close_time)}`}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </aside>
        </div>
      </div>
    </PublicShell>
  );
}
