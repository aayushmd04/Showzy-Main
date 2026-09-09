import { Link, useParams } from "react-router-dom";
import { Play, Star } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { useBriefComposer } from "@/components/naada/brief-composer";
import { dateCompact, dateListing } from "@/lib/format";
import { NotFoundScreen } from "./not-found";

/**
 * Section 7.3. The fee range is deliberately absent here — it only appears in
 * the host's artist search.
 */
export function ArtistProfileScreen() {
  const { id = "" } = useParams();
  const { artistById, events, venueOf, role, toast } = useStore();
  const { open: openBrief } = useBriefComposer();
  const artist = artistById(id);

  if (!artist) return <NotFoundScreen />;

  const appearances = events
    .filter((e) => e.lineup.includes(artist.id) && e.status !== "draft")
    .sort((a, b) => a.date.localeCompare(b.date));
  const upcoming = appearances.filter((e) => e.status === "published");
  const past = appearances.filter((e) => e.status === "completed");

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8 md:py-10">
        <header className="flex flex-col gap-5 border-b border-line pb-8 sm:flex-row sm:items-start">
          <div
            aria-hidden="true"
            className="grid size-[104px] shrink-0 place-items-center border border-line bg-surface-2 font-display text-[40px] font-extrabold text-signal"
          >
            {artist.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="t-display break-words">{artist.name}</h1>
            <p className="t-body mt-2 text-muted">
              {artist.genres.join(" · ")} · {artist.city}
            </p>
            <p className="t-small mt-2 flex items-center gap-3">
              <span className="t-mono">{artist.gigsPlayed} gigs</span>
              <span className="flex items-center gap-1">
                <Star className="size-3.5 fill-brass text-brass" aria-hidden="true" />
                <span className="t-mono">{artist.rating.toFixed(1)}</span>
              </span>
            </p>
          </div>
          <div className="shrink-0">
            {role === "host" ? (
              <Button variant="primary" onClick={() => openBrief(artist.id)}>
                Book this artist
              </Button>
            ) : (
              <Button onClick={() => toast(`Following ${artist.name}`)}>Follow</Button>
            )}
          </div>
        </header>

        <p className="t-body mt-6 max-w-[62ch]">{artist.bio}</p>

        <section className="mt-10">
          <h2 className="t-micro">Clips</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                onClick={() => toast("Clip playback isn't in this prototype")}
                className="group relative flex aspect-video items-center justify-center border border-line bg-surface-2 transition-colors hover:border-[#3a3a45]"
                aria-label={`Play clip ${i + 1} by ${artist.name}`}
              >
                <span className="absolute inset-0 scanline opacity-60" aria-hidden="true" />
                <Play
                  className="size-8 text-paper/70 transition-colors group-hover:text-signal"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </section>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <section>
            <h2 className="t-micro">Upcoming</h2>
            {upcoming.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {upcoming.map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/e/${e.id}`}
                      className="flex min-h-11 items-center justify-between gap-3 py-3 transition-colors hover:text-signal"
                    >
                      <span className="min-w-0">
                        <span className="t-mono block text-[11px] uppercase tracking-[0.08em] text-muted">
                          {dateListing(e.date)}
                        </span>
                        <span className="block truncate text-[15px]">{e.name}</span>
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 text-muted">No dates announced.</p>
            )}
          </section>

          <section>
            <h2 className="t-micro">Past gigs</h2>
            {past.length > 0 ? (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {past.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 py-3">
                    <span className="t-mono shrink-0 text-[13px] text-muted">
                      {dateCompact(e.date)}
                    </span>
                    <span className="min-w-0 truncate text-[15px]">{venueOf(e)?.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small mt-3 text-muted">Nothing on record yet.</p>
            )}
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
