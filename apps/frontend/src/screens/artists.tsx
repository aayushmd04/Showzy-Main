import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Avatar } from "@/components/naada/avatar";
import { IconTile } from "@/components/naada/icon-tile";
import { Mic2 } from "lucide-react";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { money } from "@/lib/format";
import { usePageMeta } from "@/lib/use-meta";
import { cn } from "@/lib/utils";
import type { Artist } from "@/data/fixtures";

/**
 * A fee range is business information for the people hiring: shown to hosts and
 * to no one else. Gig counts are for people in the scene (hosts and artists).
 * The server withholds both from everyone else, so these also never render for
 * a signed-out visitor even if a stale copy of the list were in memory.
 */
function ArtistCard({ artist, showFee, showGigs }: { artist: Artist; showFee: boolean; showGigs: boolean }) {
  const fee = showFee && (artist.feeMin > 0 || artist.feeMax > 0);
  const gigs = showGigs && artist.gigsPlayed > 0;
  return (
    <Link
      to={`/a/${artist.id}`}
      className="glass-soft group block overflow-hidden rounded-xl text-paper no-underline transition-transform duration-300 hover:-translate-y-1"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-2">
        <Avatar src={artist.photo} name={artist.name} rounded="rounded-none" className="transition-transform duration-500 group-hover:scale-[1.03]" />
      </div>
      <div className="p-4">
        <h3 className="line-clamp-1 text-[17px] font-semibold">{artist.name}</h3>
        <p className="mt-0.5 line-clamp-1 text-[14px] text-muted">{artist.city || "India"}</p>

        {artist.genres.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {artist.genres.slice(0, 3).map((g) => (
              <li key={g} className="rounded-full border border-[var(--glass-border-soft)] px-2.5 py-0.5 text-[12px] text-muted">
                {g}
              </li>
            ))}
          </ul>
        )}

        {(fee || gigs || artist.rating > 0) && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--glass-border-soft)] pt-3 text-[13px] text-muted">
            {fee && (
              <span className="tabular-nums">
                {money(artist.feeMin)}–{money(artist.feeMax)}
              </span>
            )}
            {gigs && (
              <span>
                {artist.gigsPlayed} {artist.gigsPlayed === 1 ? "gig" : "gigs"}
              </span>
            )}
            {artist.rating > 0 && <span>★ {artist.rating.toFixed(1)}</span>}
          </div>
        )}
      </div>
    </Link>
  );
}

export function ArtistsScreen() {
  usePageMeta({ title: "Artists", description: "Independent artists performing across Mysuru and Bengaluru." });
  const { artists, role } = useStore();
  const { open: openAuth } = useAuthSheet();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const genre = params.get("genre") ?? "All";
  const isHost = role === "host" || role === "admin";
  const inScene = isHost || role === "artist";

  const genres = useMemo(
    () => ["All", ...Array.from(new Set(artists.flatMap((a) => a.genres))).sort()],
    [artists],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return artists.filter((a) => {
      const matchQuery = !q || a.name.toLowerCase().includes(q) || a.genres.some((g) => g.toLowerCase().includes(q));
      const matchGenre = genre === "All" || a.genres.includes(genre);
      return matchQuery && matchGenre;
    });
  }, [artists, query, genre]);

  const setGenre = (g: string) => {
    const next = new URLSearchParams(params);
    if (g === "All") next.delete("genre");
    else next.set("genre", g);
    setParams(next, { replace: true });
  };

  return (
    <PublicShell>
      <div className="px-[var(--page-pad)] pb-20 pt-8 md:pt-10">
        <h1 className="font-megrim text-[clamp(30px,4vw,44px)] font-normal uppercase leading-tight">Artists</h1>
        <p className="mt-1 max-w-[56ch] text-[15px] text-muted">
          Discover independent artists performing across Mysuru and Bengaluru.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <label className="relative min-w-[240px] flex-1 sm:max-w-[360px]">
            <span className="sr-only">Search artists or genres</span>
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-[17px] -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search artists or genres"
              className="h-11 w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] pl-10 pr-3 text-[15px] text-paper placeholder:text-muted focus:border-signal focus:outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by genre">
            {genres.slice(0, 9).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGenre(g)}
                aria-pressed={genre === g}
                className={cn(
                  "min-h-9 rounded-full border px-3.5 text-[13px] font-semibold transition-colors",
                  genre === g
                    ? "border-signal bg-signal text-white"
                    : "border-[var(--glass-border-soft)] text-muted hover:border-paper/40 hover:text-paper",
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <p className="mt-5 text-[13px] text-muted" aria-live="polite">
          {filtered.length} artist{filtered.length !== 1 ? "s" : ""}
        </p>

        {filtered.length === 0 ? (
          <div className="glass-soft mt-4 rounded-xl border-dashed p-10 text-center">
            <p className="text-[17px] font-semibold">No artists found</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setGenre("All");
              }}
              className="mt-3 min-h-11 text-[14px] font-semibold text-signal underline underline-offset-4"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map((a) => (
              <li key={a.id}>
                <ArtistCard artist={a} showFee={isHost} showGigs={inScene} />
              </li>
            ))}
          </ul>
        )}

        <section className="glass-soft mt-14 flex flex-col items-center gap-4 rounded-2xl px-6 py-10 text-center">
          <IconTile icon={Mic2} />
          <h2 className="font-megrim text-[clamp(22px,3vw,30px)] font-normal uppercase leading-tight">Are you an artist?</h2>
          <p className="max-w-[48ch] text-[15px] text-muted">
            Join Showzy to get booked for gigs, manage your calendar, and receive payments directly.
          </p>
          <button
            type="button"
            onClick={() => openAuth("Join as an artist", { preferRole: "artist" })}
            className="min-h-11 rounded-full bg-signal px-7 text-[15px] font-bold text-white transition-opacity hover:opacity-90"
          >
            Join as an artist
          </button>
        </section>
      </div>
    </PublicShell>
  );
}
