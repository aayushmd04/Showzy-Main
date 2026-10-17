/**
 * The main page: rails of posters you scroll sideways, the way ticketing apps
 * have taught people to browse. Familiar on purpose, so the only thing that
 * feels new is what is on it: live art in small rooms.
 *
 * Browsing is open to everyone. Sign-in is asked for only when someone acts
 * (booking, hosting, joining), so this page never gates anything.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";

import { PublicShell } from "@/components/naada/public-shell";
import { CategoryRow } from "@/components/naada/category-row";
import { FeedCarousel, type FeedSlide } from "@/components/naada/feed-carousel";
import { CATEGORIES, inCategory, type CategoryId } from "@/lib/categories";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";
import { dateListing, daysFromNow, money, today } from "@/lib/format";
import { NEARBY_EVENT, getNearbyCity, setNearbyCity } from "@/lib/nearby";
import { usePageMeta } from "@/lib/use-meta";

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Poster width: a phone shows two and a bit, a big screen shows a full row. */
const POSTER_W = "w-[44vw] max-w-[190px] sm:w-[200px] lg:w-[220px] lg:max-w-none 2xl:w-[250px]";

/** Card width in a row with only a few items: one fifth of the row, one sixth on very large screens. */
const SPARSE_W =
  "w-[44vw] max-w-[190px] sm:w-[200px] lg:max-w-none lg:w-[calc((100%-64px)/5)] 2xl:w-[calc((100%-80px)/6)]";

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
  cardWidth = POSTER_W,
  seeAllLabel,
  fill,
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
  /**
   * A card that takes up the rest of the row when there are only a few items,
   * so a quiet row reads as intentional rather than as an empty half-screen.
   */
  fill?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  // Fewer than a row's worth: share the width evenly (5 across, 6 on very large screens).
  const sparse = items.length < 5;
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) =>
    row.current?.scrollBy({ left: dir * Math.max(240, row.current.clientWidth * 0.8), behavior: "smooth" });

  return (
    <section aria-label={title} className="relative z-10">
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
        <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((it, i) => (
            <div key={itemKey(it)}>{(gridRender ?? render)(it, i)}</div>
          ))}
        </div>
      ) : (
        <div className="group/rail relative">
          <div
            ref={row}
            className="-mx-[var(--page-pad)] flex snap-x scroll-px-[var(--page-pad)] gap-3 overflow-x-auto px-[var(--page-pad)] pb-2 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden"
          >
            {items.map((it, i) => (
              <div key={itemKey(it)} className={`${sparse ? SPARSE_W : cardWidth} shrink-0 snap-start`}>
                {render(it, i)}
              </div>
            ))}
            {sparse && fill && (
              <div className="w-[44vw] max-w-[190px] shrink-0 snap-start sm:w-[200px] lg:w-auto lg:max-w-none lg:min-w-[220px] lg:flex-1">
                {fill}
              </div>
            )}
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
    <Link
      to={`/e/${event.id}`}
      className="glass-soft block overflow-hidden rounded-xl text-paper no-underline transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-surface-2">
        <img
          src={photoOf(event, index)}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover transition-transform duration-500 hover:scale-105"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
        {event.genres[0] && (
          <span className="absolute left-2 top-2 rounded-md bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white backdrop-blur-sm">
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
      <div className="px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-2 text-[16px] font-semibold leading-snug">{event.name}</h3>
        <p className="mt-0.5 truncate text-[14px] text-muted">
          {dateListing(event.date)}
          {venue ? ` · ${venue.name}` : ""}
        </p>
      </div>
    </Link>
  );
}

function FillerCard({
  title,
  body,
  cta,
  onClick,
}: {
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <div className="glass-soft flex h-full min-h-[240px] flex-col items-start justify-center gap-3 rounded-xl border-dashed p-5 lg:p-8">
      <p className="font-megrim text-[clamp(20px,2.2vw,30px)] font-normal uppercase leading-tight tracking-[0.02em]">{title}</p>
      <p className="max-w-sm text-[14px] leading-relaxed text-muted lg:text-[15px]">{body}</p>
      <button
        type="button"
        onClick={onClick}
        className="min-h-11 rounded-md border border-[var(--glass-border)] px-5 text-[14px] font-semibold text-paper transition-colors hover:border-signal hover:text-signal"
      >
        {cta}
      </button>
    </div>
  );
}

function PosterSkeleton() {
  return (
    <div className={`${POSTER_W} shrink-0 animate-pulse`} aria-hidden>
      <div className="aspect-[3/4] rounded-lg bg-surface-2" />
      <div className="mt-2 h-4 w-4/5 rounded bg-surface-2" />
      <div className="mt-2 h-3 w-3/5 rounded bg-surface-2" />
    </div>
  );
}

function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link to={`/a/${artist.id}`} className="glass-soft block rounded-xl p-3 text-center text-paper no-underline transition-transform duration-300 hover:-translate-y-1">
      <div className="mx-auto grid size-24 place-items-center overflow-hidden rounded-full border border-white/20 bg-surface-2 sm:size-28">
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
    <Link
      to="/venues"
      className="glass-soft block overflow-hidden rounded-xl text-paper no-underline transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        <img
          src={venue.photo ?? FALLBACK_PHOTOS[(index + 2) % FALLBACK_PHOTOS.length]}
          alt=""
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="px-3 pb-3 pt-2.5">
        <h3 className="line-clamp-1 text-[16px] font-semibold">{venue.name}</h3>
        <p className="flex items-center gap-1 text-[14px] text-muted">
          <MapPin className="size-3.5" aria-hidden />
          {[venue.area, venue.capacity > 0 ? `${venue.capacity} seats` : ""].filter(Boolean).join(" · ")}
        </p>
      </div>
    </Link>
  );
}

/* ── Screen ─────────────────────────────────────────────────────────────── */

export function HomeFeed() {
  const { events, artists, venues, venueOf, lang, role, currentUser } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = (params.get("q") ?? "").trim().toLowerCase();
  const [city, setCity] = useState(() => getNearbyCity() ?? "all");
  const [genre, setGenre] = useState<string | null>(null);
  const [category, setCategory] = useState<CategoryId | null>(null);
  const top = useRef<HTMLDivElement>(null);
  const rails = useRef<HTMLDivElement>(null);
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
    () =>
      upcoming
        .filter((e) => !genre || e.genres.includes(genre))
        .filter((e) => !category || inCategory(category, e.genres)),
    [upcoming, genre, category],
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
  const activeCategory = CATEGORIES.find((c) => c.id === category);
  const categoryLabel = activeCategory?.label.toLowerCase() ?? "";
  const categoryLabelKn = activeCategory?.labelKn ?? "";
  const where = city === "all" ? t("Mysuru & Bengaluru", "ಮೈಸೂರು ಮತ್ತು ಬೆಂಗಳೂರು") : city;
  const seeAll = t("See all", "ಎಲ್ಲವನ್ನೂ ನೋಡಿ");

  const poster = (e: NaadaEvent, i: number) => <PosterCard event={e} index={i} venue={venueOf(e)} />;

  const showAllEvents = () => rails.current?.scrollIntoView({ behavior: "smooth" });
  const signedIn = role !== "out" && currentUser !== null;
  const startHosting = () => openAuth("Host your event on Showzy", { preferRole: "host" });
  const joinArtists = () => openAuth("Join Showzy as an artist", { preferRole: "artist" });

  // The first slide is a placeholder for the week's trending event. It is not a
  // real listing; swap it for the best-selling upcoming event once there is one.
  const slides: FeedSlide[] = [
    {
      id: "trending",
      image: "/media/events/band-on-stage-energetic.jpg",
      position: "50% 40%",
      badge: t("Trending", "ಟ್ರೆಂಡಿಂಗ್"),
      title: t("Friday Night Live", "ಶುಕ್ರವಾರ ರಾತ್ರಿ ಲೈವ್"),
      body: t("The room everyone is talking about this week. Come early for a good seat.", "ಈ ವಾರ ಎಲ್ಲರೂ ಮಾತನಾಡುತ್ತಿರುವ ಕಾರ್ಯಕ್ರಮ. ಒಳ್ಳೆಯ ಸೀಟಿಗಾಗಿ ಬೇಗ ಬನ್ನಿ."),
      cta: t("See what's on", "ಏನಿದೆ ನೋಡಿ"),
      onClick: () => rails.current?.scrollIntoView({ behavior: "smooth" }),
    },
    // Anyone signed in has already chosen what they are here for, so the two
    // sell-side banners go to people who have not: signed-out visitors, who
    // could be hosts or artists. Everyone else sees the audience's own pair.
    ...(signedIn
      ? [
          {
            id: "artists-browse",
            image: "/media/artists/sitar-player-stage.jpg",
            position: "50% 40%",
            title: t("Meet the artists", "ಕಲಾವಿದರನ್ನು ಭೇಟಿಯಾಗಿ"),
            body: t("The people behind the nights, from open-mic regulars to classical masters.", "ರಾತ್ರಿಗಳ ಹಿಂದಿನ ಕಲಾವಿದರು, ಓಪನ್ ಮೈಕ್‌ನಿಂದ ಶಾಸ್ತ್ರೀಯ ಗುರುಗಳವರೆಗೆ."),
            cta: t("Browse artists", "ಕಲಾವಿದರನ್ನು ನೋಡಿ"),
            onClick: () => navigate("/artists"),
          },
          {
            id: "venues-browse",
            image: "/media/venues/four-chairs-blue-stage.jpg",
            position: "50% 50%",
            title: t("Rooms worth knowing", "ತಿಳಿಯಬೇಕಾದ ಸ್ಥಳಗಳು"),
            body: t("Cafés, studios and small halls where the best nights happen.", "ಅತ್ಯುತ್ತಮ ರಾತ್ರಿಗಳು ನಡೆಯುವ ಕೆಫೆ, ಸ್ಟುಡಿಯೋ ಮತ್ತು ಸಣ್ಣ ಸಭಾಂಗಣಗಳು."),
            cta: t("Browse venues", "ಸ್ಥಳಗಳನ್ನು ನೋಡಿ"),
            onClick: () => navigate("/venues"),
          },
        ]
      : [
          {
            id: "host",
            image: "/media/venues/curtained-stage-mic.jpg",
            position: "50% 50%",
            title: t("Host your event for free", "ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ ಉಚಿತವಾಗಿ ಆಯೋಜಿಸಿ"),
            body: t("Have a café, studio, pub or courtyard? Bring an audience to it.", "ಕೆಫೆ, ಸ್ಟುಡಿಯೋ, ಪಬ್ ಅಥವಾ ಅಂಗಳ ಇದೆಯೇ? ಪ್ರೇಕ್ಷಕರನ್ನು ಕರೆತನ್ನಿ."),
            cta: t("Start hosting", "ಆಯೋಜನೆ ಪ್ರಾರಂಭಿಸಿ"),
            onClick: startHosting,
          },
          {
            id: "artists",
            image: "/media/artists/guitarist-stage-light.jpg",
            position: "50% 30%",
            title: t("Find your next stage", "ನಿಮ್ಮ ಮುಂದಿನ ವೇದಿಕೆ ಹುಡುಕಿ"),
            body: t("Artists: find spaces to perform and collaborate across the city.", "ಕಲಾವಿದರೇ: ನಗರದಾದ್ಯಂತ ಪ್ರದರ್ಶನ ಮತ್ತು ಸಹಯೋಗಕ್ಕೆ ಸ್ಥಳಗಳನ್ನು ಹುಡುಕಿ."),
            cta: t("Join as an artist", "ಕಲಾವಿದರಾಗಿ ಸೇರಿ"),
            onClick: joinArtists,
          },
        ]),
  ];

  /* Search results replace the rails */
  if (q) {
    return (
      <PublicShell>
        <div className="w-full px-[var(--page-pad)] py-6">
          <h1 className="t-h1">{t("Search", "ಹುಡುಕಾಟ")}</h1>
          <p className="mt-2 text-[15px] text-muted">
            {results.length} {results.length === 1 ? "result" : "results"} for “{params.get("q")}” in {where}
          </p>
          {results.length === 0 ? (
            <div className="mt-8 glass-soft rounded-xl border-dashed p-8 text-center">
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
            <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
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
      <div ref={top} className="w-full space-y-10 px-[var(--page-pad)] pb-6 pt-5 md:space-y-12 md:pb-8 md:pt-6">
        {/* Banner flush under the header */}
        <div className="banner-wrap relative z-0 -mx-[var(--page-pad)]">
          <FeedCarousel slides={slides} label={t("Highlights", "ಮುಖ್ಯಾಂಶಗಳು")} />
        </div>

        {/* Categories, on their own with a heading, clear of the banner */}
        <section aria-label={t("Pick an art form", "ಕಲಾ ಪ್ರಕಾರ ಆರಿಸಿ")} className="relative z-10">
          <h2 className="font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em]">
            {t("What's your scene?", "ನಿಮ್ಮ ಆಯ್ಕೆ ಯಾವುದು?")}
          </h2>
          <p className="mb-4 mt-0.5 text-[14px] text-muted">
            {t("Pick an art form to see what's on", "ಏನಿದೆ ನೋಡಲು ಕಲಾ ಪ್ರಕಾರ ಆರಿಸಿ")}
          </p>
          <CategoryRow
            value={category}
            onChange={setCategory}
            onSeeAll={() => {
              setCategory(null);
              setGenre(null);
              rails.current?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </section>

        <div ref={rails} className="scroll-mt-24" />

        {/* Recommended */}
        {loading ? (
          <section aria-label="Loading events">
            <div className="mb-3 h-7 w-56 animate-pulse rounded bg-paper/10" />
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 5 }, (_, i) => (
                <PosterSkeleton key={i} />
              ))}
            </div>
          </section>
        ) : shown.length === 0 ? (
          <div className="glass-soft rounded-xl border-dashed p-8 text-center">
            <p className="text-[18px] font-semibold">
              {category
                ? t(`No ${categoryLabel} events yet`, `ಇನ್ನೂ ${categoryLabelKn} ಕಾರ್ಯಕ್ರಮಗಳಿಲ್ಲ`)
                : t("Nothing on sale right now", "ಇದೀಗ ಯಾವುದೂ ಮಾರಾಟದಲ್ಲಿಲ್ಲ")}
            </p>
            <p className="mt-1 text-[15px] text-muted">
              {category
                ? t("New ones are added all the time. Check back soon, or look at everything that's on.", "ಹೊಸವು ಆಗಾಗ ಸೇರುತ್ತವೆ. ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ನೋಡಿ, ಅಥವಾ ಎಲ್ಲವನ್ನೂ ನೋಡಿ.")
                : t("Try another city or type, or check back soon.", "ಬೇರೆ ನಗರ ಅಥವಾ ಪ್ರಕಾರ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಮತ್ತೆ ನೋಡಿ.")}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {(city !== "all" || genre || category) && (
                <button
                  type="button"
                  onClick={() => {
                    setGenre(null);
                    setCategory(null);
                    setNearbyCity("all");
                  }}
                  className="min-h-11 rounded-md border border-line px-5 text-[15px] font-semibold hover:border-paper/50"
                >
                  {t("Show everything", "ಎಲ್ಲವನ್ನೂ ತೋರಿಸಿ")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <Rail
            title={t("Recommended events", "ಶಿಫಾರಸು ಮಾಡಿದ ಕಾರ್ಯಕ್ರಮಗಳು")}
            subtitle={`${t("In", "")} ${where}`.trim()}
            items={shown}
            itemKey={(e) => e.id}
            render={poster}
            seeAllLabel={seeAll}
            fill={
              <FillerCard
                title={t("Looking for something else?", "ಬೇರೇನಾದರೂ ಹುಡುಕುತ್ತಿದ್ದೀರಾ?")}
                body={t("Browse the artists and venues, or look at everything that is on.", "ಕಲಾವಿದರು ಮತ್ತು ಸ್ಥಳಗಳನ್ನು ನೋಡಿ, ಅಥವಾ ಎಲ್ಲವನ್ನೂ ನೋಡಿ.")}
                cta={t("Browse artists", "ಕಲಾವಿದರನ್ನು ನೋಡಿ")}
                onClick={() => navigate("/artists")}
              />
            }
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
            fill={
              <FillerCard
                title={t("More nights are on the way", "ಇನ್ನಷ್ಟು ಕಾರ್ಯಕ್ರಮಗಳು ಬರಲಿವೆ")}
                body={t("See what is coming up later on.", "ಮುಂದೆ ಏನೇನಿದೆ ನೋಡಿ.")}
                cta={t("See all events", "ಎಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು")}
                onClick={showAllEvents}
              />
            }
          />
        )}

        {/* Best of live arts: tiles that filter the rails above */}
        {genres.length > 0 && (
          <section aria-label={t("The best of live arts", "ಲೈವ್ ಕಲೆಯ ಅತ್ಯುತ್ತಮ")}>
            <h2 className="mb-3 font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em]">
              {t("The best of live arts", "ಲೈವ್ ಕಲೆಯ ಅತ್ಯುತ್ತಮ")}
            </h2>
            <div className="-mx-[var(--page-pad)] flex snap-x scroll-px-[var(--page-pad)] gap-3 overflow-x-auto px-[var(--page-pad)] pb-2 [scrollbar-width:none] md:gap-4 [&::-webkit-scrollbar]:hidden">
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
                    className="relative isolate h-[130px] w-[44vw] max-w-[200px] shrink-0 snap-start overflow-hidden rounded-xl text-left text-white sm:w-[200px] lg:w-[220px] lg:max-w-none 2xl:w-[250px]"
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
            fill={
              <FillerCard
                title={t("New free nights every week", "ಪ್ರತಿ ವಾರ ಹೊಸ ಉಚಿತ ಕಾರ್ಯಕ್ರಮಗಳು")}
                body={t("Check back soon, or look at everything that is on.", "ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ನೋಡಿ, ಅಥವಾ ಎಲ್ಲವನ್ನೂ ನೋಡಿ.")}
                cta={t("See all events", "ಎಲ್ಲಾ ಕಾರ್ಯಕ್ರಮಗಳು")}
                onClick={showAllEvents}
              />
            }
          />
        )}

        {/* Artists */}
        {artists.length > 0 && (
          <Rail
            title={t("Artists to watch", "ಗಮನಿಸಬೇಕಾದ ಕಲಾವಿದರು")}
            items={artists}
            itemKey={(a) => a.id}
            render={(a) => <ArtistCard artist={a} />}
            cardWidth="w-[132px] sm:w-[148px] 2xl:w-[172px]"
            seeAllLabel={seeAll}
            fill={
              <FillerCard
                title={t("Meet more artists", "ಇನ್ನಷ್ಟು ಕಲಾವಿದರನ್ನು ಭೇಟಿಯಾಗಿ")}
                body={t("Everyone performing across Mysuru and Bengaluru, in one place.", "ಮೈಸೂರು ಮತ್ತು ಬೆಂಗಳೂರಿನ ಎಲ್ಲಾ ಕಲಾವಿದರು, ಒಂದೇ ಕಡೆ.")}
                cta={t("All artists", "ಎಲ್ಲಾ ಕಲಾವಿದರು")}
                onClick={() => navigate("/artists")}
              />
            }
          />
        )}

        {/* Venues */}
        {venues.length > 0 && (
          <Rail
            title={t("Rooms to discover", "ಕಂಡುಹಿಡಿಯಬೇಕಾದ ಸ್ಥಳಗಳು")}
            items={venues}
            itemKey={(v) => v.id}
            render={(v, i) => <VenueCard venue={v} index={i} />}
            cardWidth="w-[62vw] max-w-[240px] sm:w-[240px] lg:max-w-none lg:w-[270px] 2xl:w-[310px]"
            seeAllLabel={seeAll}
            fill={
              <FillerCard
                title={t("Explore every room", "ಪ್ರತಿ ಸ್ಥಳವನ್ನೂ ನೋಡಿ")}
                body={t("The cafes, studios and halls hosting live art.", "ಲೈವ್ ಕಲೆಯನ್ನು ಆಯೋಜಿಸುವ ಕೆಫೆ, ಸ್ಟುಡಿಯೋ ಮತ್ತು ಸಭಾಂಗಣಗಳು.")}
                cta={t("All venues", "ಎಲ್ಲಾ ಸ್ಥಳಗಳು")}
                onClick={() => navigate("/venues")}
              />
            }
          />
        )}
      </div>
    </PublicShell>
  );
}
