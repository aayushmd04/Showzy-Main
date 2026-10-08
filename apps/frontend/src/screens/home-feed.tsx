/**
 * The main page: rails of posters you scroll sideways, the way ticketing apps
 * have taught people to browse. Familiar on purpose, so the only thing that
 * feels new is what is on it: live art in small rooms.
 *
 * Browsing is open to everyone. Sign-in is asked for only when someone acts
 * (booking, hosting, joining), so this page never gates anything.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { PublicShell } from "@/components/naada/public-shell";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";
import { dateListing, daysFromNow, money, today } from "@/lib/format";
import { NEARBY_EVENT, getNearbyCity, setNearbyCity } from "@/lib/nearby";
import { usePageMeta } from "@/lib/use-meta";

/* ── Helpers ────────────────────────────────────────────────────────────── */

const FALLBACK_PHOTOS = ["/gig-1.jpg", "/gig-2.jpg", "/gig-3.jpg", "/gig-4.jpg", "/gig-5.jpg"];

type Photoed = { _posterImage?: string; _cityName?: string };

const photoOf = (e: NaadaEvent, i: number) =>
  (e as NaadaEvent & Photoed)._posterImage ?? FALLBACK_PHOTOS[i % FALLBACK_PHOTOS.length];

const cityOf = (e: NaadaEvent) => (e as NaadaEvent & Photoed)._cityName ?? "";

const lowest = (e: NaadaEvent) => (e.tiers.length ? Math.min(...e.tiers.map((t) => t.price)) : null);
const isFree = (e: NaadaEvent) => lowest(e) === 0;
const capacity = (e: NaadaEvent) => e.tiers.reduce((n, t) => n + t.capacity, 0);
const left = (e: NaadaEvent) => Math.max(0, capacity(e) - e.tiers.reduce((n, t) => n + t.sold, 0));
const fewLeft = (e: NaadaEvent) => capacity(e) > 0 && left(e) > 0 && left(e) / capacity(e) <= 0.25;
const soldOut = (e: NaadaEvent) => capacity(e) > 0 && left(e) === 0;

const GENRE_COLOURS = ["#C4472E", "#7C3AED", "#2563EB", "#16A34A", "#D97706", "#BE185D"];

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Rail<T>({
  title,
  subtitle,
  items,
  itemKey,
  render,
  gridRender,
  cardWidth = "w-[44vw] max-w-[190px] sm:w-[200px]",
  seeAllLabel,
}: {
  title: string;
  subtitle?: string;
  items: T[];
  itemKey: (item: T) => string;
  render: (item: T, index: number) => ReactNode;
  /** When "See all" is on, items lay out in a grid instead of a row. */
  gridRender?: (item: T, index: number) => ReactNode;
  cardWidth?: string;
  seeAllLabel: string;
}) {
  const [all, setAll] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) =>
    row.current?.scrollBy({ left: dir * Math.max(240, row.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em]">
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-[14px] text-muted">{subtitle}</p>}
        </div>
        {items.length > 3 && (
          <button
            type="button"
            onClick={() => setAll((v) => !v)}
            className="shrink-0 whitespace-nowrap py-2 text-[15px] font-semibold text-signal hover:underline"
          >
            {all ? "Show less" : `${seeAllLabel} ›`}
          </button>
        )}
      </div>

      {all ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((it, i) => (
            <div key={itemKey(it)}>{(gridRender ?? render)(it, i)}</div>
          ))}
        </div>
      ) : (
        <div className="group/rail relative">
          <div
            ref={row}
            className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:scroll-px-8 [scrollbar-width:none] md:-mx-8 md:gap-4 md:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {items.map((it, i) => (
              <div key={itemKey(it)} className={`${cardWidth} shrink-0 snap-start`}>
                {render(it, i)}
              </div>
            ))}
          </div>
          {items.length > 4 && (
            <>
              <button
                type="button"
                aria-label="Scroll left"
                onClick={() => scroll(-1)}
                className="absolute -left-3 top-[34%] hidden size-10 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black group-hover/rail:opacity-100 lg:grid"
              >
                <ChevronLeft className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Scroll right"
                onClick={() => scroll(1)}
                className="absolute -right-3 top-[34%] hidden size-10 place-items-center rounded-full bg-black/70 text-white opacity-0 transition-opacity hover:bg-black group-hover/rail:opacity-100 lg:grid"
              >
                <ChevronRight className="size-5" aria-hidden />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function PosterCard({ event, index, venue }: { event: NaadaEvent; index: number; venue?: Venue }) {
  const low = lowest(event);
  const price = soldOut(event) ? "Sold out" : low === null ? "Details soon" : low === 0 ? "Free entry" : `From ${money(low)}`;
  return (
    <Link to={`/e/${event.id}`} className="block text-paper no-underline">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-surface-2">
        <img
          src={photoOf(event, index)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 hover:scale-105"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25" />
        {event.genres[0] && (
          <span className="absolute left-2 top-2 rounded bg-black/60 px-2 py-0.5 text-[12px] font-semibold text-white">
            {event.genres[0]}
          </span>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 px-2.5 pb-2 text-white">
          <span className="text-[14px] font-bold">{price}</span>
          {fewLeft(event) && !soldOut(event) && (
            <span className="rounded bg-signal px-1.5 py-0.5 text-[11px] font-bold">Few left</span>
          )}
        </div>
      </div>
      <h3 className="mt-2 line-clamp-2 text-[16px] font-semibold leading-snug">{event.name}</h3>
      <p className="mt-0.5 truncate text-[14px] text-muted">
        {dateListing(event.date)}
        {venue ? ` · ${venue.name}` : ""}
      </p>
    </Link>
  );
}

function PosterSkeleton() {
  return (
    <div className="w-[44vw] max-w-[190px] shrink-0 animate-pulse sm:w-[200px]" aria-hidden>
      <div className="aspect-[3/4] rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-4/5 rounded bg-surface-2" />
      <div className="mt-2 h-3 w-3/5 rounded bg-surface-2" />
    </div>
  );
}

function Banner({
  image,
  title,
  body,
  cta,
  onClick,
}: {
  image: string;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="relative isolate overflow-hidden rounded-xl bg-surface-2">
      <img src={image} alt="" loading="lazy" className="absolute inset-0 -z-10 size-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-black/60" />
      <div className="flex min-h-[170px] flex-col items-start justify-center gap-3 p-5 md:min-h-[190px] md:p-7">
        <h3 className="font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em] text-white">
          {title}
        </h3>
        <p className="max-w-sm text-[15px] leading-snug text-white/85">{body}</p>
        <button
          type="button"
          onClick={onClick}
          className="mt-1 min-h-11 rounded-md bg-signal px-5 text-[15px] font-semibold text-white hover:bg-[#d4503a]"
        >
          {cta}
        </button>
      </div>
    </div>
  );
}

function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link to={`/a/${artist.id}`} className="block text-center text-paper no-underline">
      <div className="mx-auto grid size-28 place-items-center overflow-hidden rounded-full border border-line bg-surface-2 sm:size-32">
        {artist.photo ? (
          <img src={artist.photo} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="font-megrim text-[40px] uppercase">{artist.name.slice(0, 1)}</span>
        )}
      </div>
      <h3 className="mt-2 line-clamp-1 text-[16px] font-semibold">{artist.name}</h3>
      <p className="line-clamp-1 text-[14px] text-muted">{artist.genres.slice(0, 2).join(" · ") || artist.city}</p>
    </Link>
  );
}

function VenueCard({ venue, index }: { venue: Venue; index: number }) {
  return (
    <Link to="/venues" className="block text-paper no-underline">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface-2">
        <img
          src={venue.photo ?? FALLBACK_PHOTOS[(index + 2) % FALLBACK_PHOTOS.length]}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <h3 className="mt-2 line-clamp-1 text-[16px] font-semibold">{venue.name}</h3>
      <p className="flex items-center gap-1 text-[14px] text-muted">
        <MapPin className="size-3.5" aria-hidden />
        {[venue.area, venue.capacity > 0 ? `${venue.capacity} seats` : ""].filter(Boolean).join(" · ")}
      </p>
    </Link>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export function HomeFeed() {
  const { events, artists, venues, venueOf, lang } = useStore();
  const { open: openAuth } = useAuthSheet();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const [city, setCity] = useState(() => getNearbyCity() ?? "all");
  const [genre, setGenre] = useState<string | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const kn = lang === "kn";
  const t = (en: string, k: string) => (kn ? k : en);

  usePageMeta({
    description:
      "Live art in Mysuru and Bengaluru: music, theatre, dance, comedy and more, in small rooms near you.",
  });

  useEffect(() => {
    const onNearby = (e: Event) => setCity((e as CustomEvent<string>).detail || "all");
    window.addEventListener(NEARBY_EVENT, onNearby);
    return () => window.removeEventListener(NEARBY_EVENT, onNearby);
  }, []);

  const loading = events.length === 0;

  const upcoming = useMemo(
    () =>
      events
        .filter((e) => e.status === "published" && e.date >= today())
        .filter((e) => city === "all" || cityOf(e).toLowerCase() === city.toLowerCase())
        .sort((a, b) => a.date.localeCompare(b.date)),
    [events, city],
  );

  const genres = useMemo(() => {
    const n: Record<string, number> = {};
    upcoming.forEach((e) => e.genres.forEach((g) => (n[g] = (n[g] ?? 0) + 1)));
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }, [upcoming]);

  const shown = useMemo(
    () => (genre ? upcoming.filter((e) => e.genres.includes(genre)) : upcoming),
    [upcoming, genre],
  );

  const results = useMemo(() => {
    if (!q) return [];
    return upcoming.filter((e) => {
      const v = venueOf(e);
      const lineup = e.lineup.map((id) => artists.find((a) => a.id === id)?.name ?? "").join(" ");
      return `${e.name} ${v?.name ?? ""} ${v?.area ?? ""} ${e.genres.join(" ")} ${lineup}`.toLowerCase().includes(q);
    });
  }, [q, upcoming, venueOf, artists]);

  const weekEnd = daysFromNow(7);
  const thisWeek = shown.filter((e) => e.date <= weekEnd);
  const free = shown.filter(isFree);
  const where = city === "all" ? t("Mysuru & Bengaluru", "ಮೈಸೂರು ಮತ್ತು ಬೆಂಗಳೂರು") : city;
  const seeAll = t("See all", "ಎಲ್ಲವನ್ನೂ ನೋಡಿ");

  const poster = (e: NaadaEvent, i: number) => <PosterCard event={e} index={i} venue={venueOf(e)} />;

  const startHosting = () => openAuth("Host your event on Naada", { preferRole: "host" });
  const joinArtists = () => openAuth("Join Naada as an artist", { preferRole: "artist" });

  /* Search results replace the rails */
  if (q) {
    return (
      <PublicShell>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-6 md:px-8">
          <h1 className="t-h1">{t("Search", "ಹುಡುಕಾಟ")}</h1>
          <p className="mt-2 text-[15px] text-muted">
            {results.length} {results.length === 1 ? "result" : "results"} for “{params.get("q")}” in {where}
          </p>
          {results.length === 0 ? (
            <div className="mt-8 rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-[17px] font-semibold">{t("Nothing matched that search", "ಯಾವುದೂ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ")}</p>
              <p className="mt-1 text-[15px] text-muted">
                {t("Try a different word, or switch city.", "ಬೇರೆ ಪದ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ನಗರ ಬದಲಿಸಿ.")}
              </p>
              {city !== "all" && (
                <button
                  type="button"
                  onClick={() => setNearbyCity("all")}
                  className="mt-4 min-h-11 rounded-md border border-line px-5 text-[15px] font-semibold hover:border-paper/50"
                >
                  {t("Search all cities", "ಎಲ್ಲಾ ನಗರಗಳಲ್ಲಿ ಹುಡುಕಿ")}
                </button>
              )}
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
              {results.map((e, i) => (
                <div key={e.id}>{poster(e, i)}</div>
              ))}
            </div>
          )}
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div ref={top} className="mx-auto w-full max-w-[1280px] space-y-10 px-4 py-6 md:space-y-12 md:px-8 md:py-8">
        {/* Category chips */}
        {genres.length > 0 && (
          <div
            role="group"
            aria-label={t("Filter by type", "ಪ್ರಕಾರದ ಪ್ರಕಾರ ಫಿಲ್ಟರ್")}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] md:-mx-8 md:px-8 [&::-webkit-scrollbar]:hidden"
          >
            {[null, ...genres.map(([g]) => g)].map((g) => {
              const active = g === genre;
              return (
                <button
                  key={g ?? "all"}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setGenre(g)}
                  className={`min-h-10 shrink-0 whitespace-nowrap rounded-full border px-4 text-[14px] font-semibold transition-colors ${
                    active ? "border-signal bg-signal text-white" : "border-line text-paper hover:border-paper/50"
                  }`}
                >
                  {g ?? t("All", "ಎಲ್ಲಾ")}
                </button>
              );
            })}
          </div>
        )}

        {/* Recommended */}
        {loading ? (
          <section aria-label="Loading events">
            <div className="mb-3 h-7 w-56 animate-pulse rounded bg-surface-2" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 5 }, (_, i) => (
                <PosterSkeleton key={i} />
              ))}
            </div>
          </section>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-8 text-center">
            <p className="text-[18px] font-semibold">{t("Nothing on sale right now", "ಇದೀಗ ಯಾವುದೂ ಮಾರಾಟದಲ್ಲಿಲ್ಲ")}</p>
            <p className="mt-1 text-[15px] text-muted">
              {t("Try another city or type, or check back soon.", "ಬೇರೆ ನಗರ ಅಥವಾ ಪ್ರಕಾರ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಮತ್ತೆ ನೋಡಿ.")}
            </p>
            {(city !== "all" || genre) && (
              <button
                type="button"
                onClick={() => {
                  setGenre(null);
                  setNearbyCity("all");
                }}
                className="mt-4 min-h-11 rounded-md bg-signal px-5 text-[15px] font-semibold text-white hover:bg-[#d4503a]"
              >
                {t("Show everything", "ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ")}
              </button>
            )}
          </div>
        ) : (
          <Rail
            title={t("Recommended events", "ಶಿಫಾರಸು ಮಾಡಿದ ಕಾರ್ಯಕ್ರಮಗಳು")}
            subtitle={`${t("In", "")} ${where}`.trim()}
            items={shown}
            itemKey={(e) => e.id}
            render={poster}
            seeAllLabel={seeAll}
          />
        )}

        {/* This week */}
        {thisWeek.length > 0 && thisWeek.length < shown.length && (
          <Rail
            title={t("This week", "ಈ ವಾರ")}
            subtitle={t("The next seven nights", "ಮುಂದಿನ ಏಳು ರಾತ್ರಿಗಳು")}
            items={thisWeek}
            itemKey={(e) => e.id}
            render={poster}
            seeAllLabel={seeAll}
          />
        )}

        {/* Best of live arts: tiles that filter the rails above */}
        {genres.length > 0 && (
          <section aria-label={t("The best of live arts", "ಲೈವ್ ಕಲೆಯ ಅತ್ಯುತ್ತಮ")}>
            <h2 className="mb-3 font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em]">
              {t("The best of live arts", "ಲೈವ್ ಕಲೆಯ ಅತ್ಯುತ್ತಮ")}
            </h2>
            <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 md:scroll-px-8 [scrollbar-width:none] md:-mx-8 md:gap-4 md:px-8 [&::-webkit-scrollbar]:hidden">
              {genres.map(([g, n], i) => {
                const sample = upcoming.find((e) => e.genres.includes(g));
                const colour = GENRE_COLOURS[i % GENRE_COLOURS.length];
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      setGenre(g);
                      top.current?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className="relative isolate h-[130px] w-[44vw] max-w-[200px] shrink-0 snap-start overflow-hidden rounded-xl text-left text-white sm:w-[200px]"
                    style={{ background: colour }}
                  >
                    {sample && (
                      <img
                        src={photoOf(sample, i)}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 -z-10 size-full object-cover opacity-40 mix-blend-multiply"
                      />
                    )}
                    <span className="absolute inset-x-0 bottom-0 p-3">
                      <span className="block font-megrim text-[24px] font-normal uppercase leading-none tracking-[0.02em]">
                        {g}
                      </span>
                      <span className="mt-1 block text-[13px] font-semibold opacity-90">
                        {n} {n === 1 ? t("event", "ಕಾರ್ಯಕ್ರಮ") : t("events", "ಕಾರ್ಯಕ್ರಮಗಳು")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Free */}
        {free.length > 0 && free.length < shown.length && (
          <Rail
            title={t("Free to attend", "ಉಚಿತ ಪ್ರವೇಶ")}
            subtitle={t("No ticket needed, just turn up", "ಟಿಕೆಟ್ ಬೇಡ, ಬಂದರೆ ಸಾಕು")}
            items={free}
            itemKey={(e) => e.id}
            render={poster}
            seeAllLabel={seeAll}
          />
        )}

        {/* Promotions: the supply side, in the same format as everything else */}
        <section className="grid gap-4 md:grid-cols-2" aria-label={t("For hosts and artists", "ಆಯೋಜಕರು ಮತ್ತು ಕಲಾವಿದರಿಗೆ")}>
          <Banner
            image="/media/venues/curtained-stage-mic.jpg"
            title={t("Host your event for free", "ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ ಉಚಿತವಾಗಿ ಆಯೋಜಿಸಿ")}
            body={t("Have a café, studio, pub or courtyard? Bring an audience to it.", "ಕೆಫೆ, ಸ್ಟುಡಿಯೋ, ಪಬ್ ಅಥವಾ ಅಂಗಳ ಇದೆಯೇ? ಪ್ರೇಕ್ಷಕರನ್ನು ಕರೆತನ್ನಿ.")}
            cta={t("Start hosting", "ಆಯೋಜನೆ ಪ್ರಾರಂಭಿಸಿ")}
            onClick={startHosting}
          />
          <Banner
            image="/media/artists/guitarist-stage-light.jpg"
            title={t("Find your next stage", "ನಿಮ್ಮ ಮುಂದಿನ ವೇದಿಕೆ ಹುಡುಕಿ")}
            body={t("Artists: find spaces to perform and collaborate across the city.", "ಕಲಾವಿದರೇ: ನಗರದಾದ್ಯಂತ ಪ್ರದರ್ಶನ ಮತ್ತು ಸಹಯೋಗಕ್ಕೆ ಸ್ಥಳಗಳನ್ನು ಹುಡುಕಿ.")}
            cta={t("Join as an artist", "ಕಲಾವಿದರಾಗಿ ಸೇರಿ")}
            onClick={joinArtists}
          />
        </section>

        {/* Artists */}
        {artists.length > 0 && (
          <Rail
            title={t("Artists to watch", "ಗಮನಿಸಬೇಕಾದ ಕಲಾವಿದರು")}
            items={artists}
            itemKey={(a) => a.id}
            render={(a) => <ArtistCard artist={a} />}
            cardWidth="w-[132px] sm:w-[148px]"
            seeAllLabel={seeAll}
          />
        )}

        {/* Venues */}
        {venues.length > 0 && (
          <Rail
            title={t("Rooms to discover", "ಕಂಡುಹಿಡಿಯಬೇಕಾದ ಸ್ಥಳಗಳು")}
            items={venues}
            itemKey={(v) => v.id}
            render={(v, i) => <VenueCard venue={v} index={i} />}
            cardWidth="w-[62vw] max-w-[240px] sm:w-[240px]"
            seeAllLabel={seeAll}
          />
        )}
      </div>
    </PublicShell>
  );
}
