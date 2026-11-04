import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Compass, Mic2, Landmark } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { IconTile } from "@/components/naada/icon-tile";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import { ArtistCard, PosterCard, VenueCard } from "@/screens/home-feed";
import { CATEGORIES, inCategory } from "@/lib/categories";
import { today } from "@/lib/format";
import { usePageMeta } from "@/lib/use-meta";
import { cn } from "@/lib/utils";

/**
 * One art form, from all three sides of the marketplace.
 *
 * `/explore?category=drama` or `/explore?genre=Improv`. An audience member sees
 * the nights they can book; an artist sees who else works in it and can join; a
 * host sees which rooms already host it and can put one on. The same page, so
 * an art form is one thing across the site, not three.
 */
export function ExploreScreen() {
  const { events, artists, venues, venueOf, role } = useStore();
  const { open: openAuth } = useAuthSheet();
  const [params] = useSearchParams();
  const categoryId = params.get("category");
  const genre = (params.get("genre") ?? "").trim();

  const category = CATEGORIES.find((c) => c.id === categoryId) ?? null;
  const g = genre.toLowerCase();
  const label = genre || category?.label || "Everything on";

  usePageMeta({
    title: genre ? `${genre} nights` : category ? `${category.label} nights` : "Explore",
    description: `Find ${genre || category?.label.toLowerCase() || "live art"} nights, artists and venues in Mysuru and Bengaluru.`,
  });

  const matchesGenres = (genres: string[]) =>
    genre ? genres.some((x) => x.toLowerCase() === g) : category ? inCategory(category.id, genres) : true;

  const nights = useMemo(
    () =>
      events
        .filter((e) => e.status === "published" && e.date >= today() && matchesGenres(e.genres))
        .sort((a, b) => a.date.localeCompare(b.date)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, genre, categoryId],
  );
  const performers = useMemo(
    () => artists.filter((a) => matchesGenres(a.genres)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [artists, genre, categoryId],
  );
  const rooms = useMemo(() => {
    const ids = new Set(nights.map((e) => venueOf(e)?.id).filter(Boolean) as string[]);
    return venues.filter((v) => ids.has(v.id));
  }, [nights, venues, venueOf]);

  // The finer genres inside this category, as links, so "Drama" leads to "Theatre" and "Street Play".
  const related = useMemo(() => {
    if (!category) return [];
    const seen = new Map<string, number>();
    events
      .filter((e) => e.status === "published" && e.date >= today())
      .forEach((e) => e.genres.filter((x) => inCategory(category.id, [x])).forEach((x) => seen.set(x, (seen.get(x) ?? 0) + 1)));
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([x]) => x);
  }, [events, category]);

  const noun = (genre || category?.label || "live art").toLowerCase();
  const empty = nights.length === 0;

  return (
    <PublicShell>
      <div className="px-[var(--page-pad)] pb-20 pt-8 md:pt-10">
        <nav aria-label="Art forms" className="-mx-[var(--page-pad)] flex gap-2 overflow-x-auto px-[var(--page-pad)] pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            to="/explore"
            className={cn(
              "inline-flex min-h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-semibold no-underline transition-colors",
              !category && !genre ? "border-signal bg-signal text-white" : "border-[var(--glass-border-soft)] text-muted hover:text-paper",
            )}
          >
            All
          </Link>
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              to={`/explore?category=${c.id}`}
              aria-current={category?.id === c.id && !genre ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold no-underline transition-colors",
                category?.id === c.id && !genre
                  ? "border-signal bg-signal text-white"
                  : "border-[var(--glass-border-soft)] text-muted hover:text-paper",
              )}
            >
              <c.icon className="size-3.5" aria-hidden="true" />
              {c.label}
            </Link>
          ))}
        </nav>

        <h1 className="mt-6 font-megrim text-[clamp(30px,4.5vw,50px)] font-normal uppercase leading-tight">{label}</h1>
        <p className="mt-1 text-[15px] text-muted" aria-live="polite">
          {nights.length} {nights.length === 1 ? "night" : "nights"} coming up · {performers.length}{" "}
          {performers.length === 1 ? "artist" : "artists"} · {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
        </p>

        {related.length > 1 && (
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={`More in ${category?.label}`}>
            {related.map((x) => (
              <li key={x}>
                <Link
                  to={`/explore?genre=${encodeURIComponent(x)}`}
                  className="inline-flex min-h-8 items-center rounded-full border border-[var(--glass-border-soft)] px-3 text-[13px] text-muted no-underline transition-colors hover:border-signal hover:text-paper"
                >
                  {x}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* Audience */}
        <section className="mt-8" aria-label="Nights you can book">
          <h2 className="t-micro">Book a night</h2>
          {empty ? (
            <div className="glass-soft mt-3 rounded-xl border-dashed p-8 text-center">
              <p className="text-[17px] font-semibold">No {noun} nights are on sale yet</p>
              <p className="mt-1 text-[15px] text-muted">New ones are added all the time. Follow the artists below, or look at everything on.</p>
              <Link to="/whats-on" className="btn btn-secondary mt-4 no-underline">
                See what's on
              </Link>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
              {nights.map((e, i) => (
                <div key={e.id}>
                  <PosterCard event={e} index={i} venue={venueOf(e)} />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Artists */}
        {performers.length > 0 && (
          <section className="mt-12" aria-label={`Artists in ${noun}`}>
            <h2 className="t-micro">Artists</h2>
            <ul className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {performers.map((a) => (
                <li key={a.id}>
                  <ArtistCard artist={a} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Venues */}
        {rooms.length > 0 && (
          <section className="mt-12" aria-label={`Rooms hosting ${noun}`}>
            <h2 className="t-micro">Rooms hosting it</h2>
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {rooms.map((v, i) => (
                <li key={v.id}>
                  <VenueCard venue={v} index={i} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Artists and hosts: the other two sides */}
        {(
          <section className="mt-14 grid gap-3 md:grid-cols-3" aria-label="Get involved">
            <div className="glass-soft flex flex-col items-start gap-3 rounded-xl p-5">
              <IconTile icon={Compass} size={44} still />
              <h2 className="text-[17px] font-semibold">Go to one</h2>
              <p className="text-[14px] text-muted">Pick a night above. Tickets are a few taps; your QR is your way in.</p>
            </div>
            <div className="glass-soft flex flex-col items-start gap-3 rounded-xl p-5">
              <IconTile icon={Mic2} size={44} still />
              <h2 className="text-[17px] font-semibold">Perform {noun}</h2>
              <p className="text-[14px] text-muted">Add {noun} to your profile and hosts looking for it can find and book you.</p>
              {role === "artist" ? (
                <Link to="/artist/profile" className="mt-auto inline-flex min-h-11 items-center text-[14px] font-semibold text-signal underline underline-offset-4">
                  Add it to your profile
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuth("Join Showzy as an artist", { preferRole: "artist" })}
                  className="mt-auto min-h-11 text-[14px] font-semibold text-signal underline underline-offset-4"
                >
                  Join as an artist
                </button>
              )}
            </div>
            <div className="glass-soft flex flex-col items-start gap-3 rounded-xl p-5">
              <IconTile icon={Landmark} size={44} still />
              <h2 className="text-[17px] font-semibold">Host {/^[aeiou]/i.test(noun) ? "an" : "a"} {noun} night</h2>
              <p className="text-[14px] text-muted">Create the event, find an artist who does it, sell tickets and settle up in one place.</p>
              {role === "host" ? (
                <Link to="/host/events/new" className="mt-auto inline-flex min-h-11 items-center text-[14px] font-semibold text-signal underline underline-offset-4">
                  Create an event
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => openAuth("Host your event on Showzy", { preferRole: "host" })}
                  className="mt-auto min-h-11 text-[14px] font-semibold text-signal underline underline-offset-4"
                >
                  Start hosting
                </button>
              )}
            </div>
          </section>
        )}
      </div>
    </PublicShell>
  );
}
