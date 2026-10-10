import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import { useBriefComposer } from "@/components/naada/brief-composer";
import { ALL_GENRES } from "@/data/fixtures";
import { dateCompact, money } from "@/lib/format";

/** Section 7.11 — Artist search. The fee range is visible here and nowhere else. */
export function HostArtistSearchScreen() {
  const { artists, events, emptyLists } = useStore();
  const { open: openBrief } = useBriefComposer();
  const [genres, setGenres] = useState<string[]>([]);
  const [maxFee, setMaxFee] = useState(15000);
  const [freeOn, setFreeOn] = useState("any");

  const bookableDates = useMemo(
    () =>
      Array.from(new Set(events.filter((e) => e.status !== "completed").map((e) => e.date))).sort(),
    [events],
  );

  const results = useMemo(() => {
    if (emptyLists) return [];
    return artists
      .filter((a) => (genres.length === 0 ? true : a.genres.some((g) => genres.includes(g))))
      .filter((a) => a.feeMin <= maxFee)
      .filter((a) => {
        if (freeOn === "any") return true;
        // "Free on" — not already on a bill that night.
        return !events.some((e) => e.date === freeOn && e.lineup.includes(a.id));
      });
  }, [artists, genres, maxFee, freeOn, events, emptyLists]);

  const toggleGenre = (g: string) =>
    setGenres((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]));

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Artists"]}>
      <h1 className="t-h1">Find an artist</h1>

      <div className="mt-6 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Filters */}
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <fieldset>
            <legend className="t-micro mb-2">Genre</legend>
            <div className="flex flex-wrap gap-1.5 lg:flex-col">
              {ALL_GENRES.map((g) => (
                <label
                  key={g}
                  className="flex min-h-9 cursor-pointer items-center gap-2 text-[14px] text-muted transition-colors hover:text-paper"
                >
                  <input
                    type="checkbox"
                    checked={genres.includes(g)}
                    onChange={() => toggleGenre(g)}
                    className="size-4 accent-[#FF3D6E]"
                  />
                  {g}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="fee-band" className="t-micro mb-2 block">
              Fee band — up to <span className="t-mono text-paper">{money(maxFee)}</span>
            </label>
            <input
              id="fee-band"
              type="range"
              min={2000}
              max={15000}
              step={500}
              value={maxFee}
              onChange={(e) => setMaxFee(Number(e.target.value))}
              className="w-full accent-[#FF3D6E]"
            />
          </div>

          <div>
            <label htmlFor="free-on" className="t-micro mb-2 block">
              Free on
            </label>
            <Select
              id="free-on"
              value={freeOn}
              onChange={setFreeOn}
              options={[
                { value: "any", label: "Any night" },
                ...bookableDates.map((d) => ({ value: d, label: dateCompact(d) })),
              ]}
            />
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0">
          <p className="t-small text-muted" aria-live="polite">
            {results.length} {results.length === 1 ? "artist" : "artists"}
          </p>

          {results.length > 0 ? (
            <ul className="mt-3 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
              {results.map((artist) => (
                <li
                  key={artist.id}
                  className="flex flex-wrap items-center gap-4 px-4 py-4 transition-colors hover:bg-paper/5"
                >
                  <span
                    aria-hidden="true"
                    className="grid size-11 shrink-0 place-items-center glass-soft rounded-xl-2 font-display text-[16px] font-bold"
                  >
                    {artist.name.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <Link to={`/a/${artist.id}`} className="t-h3 truncate hover:text-signal">
                      {artist.name}
                    </Link>
                    <p className="t-small mt-0.5 flex flex-wrap items-center gap-x-3 text-muted">
                      <span className="truncate">{artist.genres.join(" · ")}</span>
                      <span className="flex items-center gap-1">
                        <Star className="size-3 fill-brass text-brass" aria-hidden="true" />
                        <span className="t-mono">{artist.rating.toFixed(1)}</span>
                      </span>
                      <span className="t-mono">{artist.gigsPlayed} gigs</span>
                    </p>
                    <p className="t-mono mt-1 text-[13px] text-brass">
                      {money(artist.feeMin)}–{money(artist.feeMax)}
                    </p>
                  </div>
                  <Button size="sm" className="shrink-0" onClick={() => openBrief(artist.id)}>
                    Send brief
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 border border-dashed border-line px-6 py-16 text-center">
              <h2 className="t-h2">No artists match those filters</h2>
              <p className="t-body mt-2 text-muted">Widen the fee band or clear a genre.</p>
              <Button
                variant="primary"
                className="mt-6"
                onClick={() => {
                  setGenres([]);
                  setMaxFee(15000);
                  setFreeOn("any");
                }}
              >
                Clear filters
              </Button>
            </div>
          )}
        </div>
      </div>
    </ConsoleShell>
  );
}
