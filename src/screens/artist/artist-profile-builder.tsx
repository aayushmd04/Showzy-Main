import { useMemo, useState } from "react";
import { Plus, Star, X } from "lucide-react";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { ALL_GENRES } from "@/data/fixtures";
import { money } from "@/lib/format";

/** Section 7.19 — profile builder with a live preview and a completeness meter. */
export function ArtistProfileBuilderScreen() {
  const { artistProfile, updateArtistProfile, artists, toast } = useStore();
  const [genreToAdd, setGenreToAdd] = useState("");

  const rohan = artists[0];

  const completeness = useMemo(() => {
    const checks = [
      artistProfile.photo,
      artistProfile.name.trim().length > 0,
      artistProfile.genres.length > 0,
      artistProfile.city.trim().length > 0,
      artistProfile.bio.trim().length >= 40,
      artistProfile.feeMin > 0 && artistProfile.feeMax > artistProfile.feeMin,
      artistProfile.clips >= 3,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [artistProfile]);

  return (
    <ConsoleShell
      nav={ARTIST_NAV}
      breadcrumb={["Profile"]}
      actions={
        <span className="hidden items-center gap-2 sm:flex">
          <span className="t-small text-muted">Profile {completeness}% complete</span>
          <span
            className="flex h-2 w-20 overflow-hidden border border-line"
            role="progressbar"
            aria-valuenow={completeness}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Profile completeness"
          >
            <span className="bg-signal" style={{ width: `${completeness}%` }} />
          </span>
        </span>
      }
    >
      <h1 className="t-h1">Your profile</h1>
      <p className="t-body mt-2 max-w-[52ch] text-muted">
        Venues search this. Clips and a filled-in fee range are what get you found.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Editor */}
        <div className="min-w-0 space-y-5">
          <div>
            <Label>Photo</Label>
            <div className="flex items-center gap-4">
              <span
                aria-hidden="true"
                className="grid size-16 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[22px] font-bold text-signal"
              >
                {artistProfile.name.charAt(0) || "?"}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  updateArtistProfile({ photo: true });
                  toast("Uploads aren't in this prototype — marked as done");
                }}
              >
                Upload
              </Button>
            </div>
          </div>

          <Field label="Name" htmlFor="ap-name">
            <Input
              id="ap-name"
              value={artistProfile.name}
              onChange={(e) => updateArtistProfile({ name: e.target.value })}
            />
          </Field>

          <div>
            <Label>Genres</Label>
            <div className="flex flex-wrap gap-2">
              {artistProfile.genres.map((g) => (
                <span
                  key={g}
                  className="flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-[14px]"
                >
                  {g}
                  <button
                    type="button"
                    onClick={() =>
                      updateArtistProfile({
                        genres: artistProfile.genres.filter((x) => x !== g),
                      })
                    }
                    aria-label={`Remove ${g}`}
                    className="text-muted transition-colors hover:text-fault"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <select
                aria-label="Add a genre"
                value={genreToAdd}
                onChange={(e) => setGenreToAdd(e.target.value)}
                className="field flex-1"
              >
                <option value="">Add a genre…</option>
                {ALL_GENRES.filter((g) => !artistProfile.genres.includes(g)).map((g) => (
                  <option key={g} value={g} className="bg-surface">
                    {g}
                  </option>
                ))}
              </select>
              <Button
                disabled={!genreToAdd}
                onClick={() => {
                  updateArtistProfile({ genres: [...artistProfile.genres, genreToAdd] });
                  setGenreToAdd("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <Field label="City" htmlFor="ap-city">
            <Input
              id="ap-city"
              value={artistProfile.city}
              onChange={(e) => updateArtistProfile({ city: e.target.value })}
            />
          </Field>

          <Field
            label="Bio"
            htmlFor="ap-bio"
            hint="Two sentences is plenty. Say what you actually play."
          >
            <Textarea
              id="ap-bio"
              rows={4}
              value={artistProfile.bio}
              onChange={(e) => updateArtistProfile({ bio: e.target.value })}
            />
          </Field>

          <div>
            <Label>Fee range</Label>
            <div className="flex items-center gap-3">
              <Input
                aria-label="Minimum fee"
                inputMode="numeric"
                className="t-mono w-[120px]"
                value={artistProfile.feeMin}
                onChange={(e) =>
                  updateArtistProfile({ feeMin: Number(e.target.value.replace(/\D/g, "")) || 0 })
                }
              />
              <span className="t-small text-muted">to</span>
              <Input
                aria-label="Maximum fee"
                inputMode="numeric"
                className="t-mono w-[120px]"
                value={artistProfile.feeMax}
                onChange={(e) =>
                  updateArtistProfile({ feeMax: Number(e.target.value.replace(/\D/g, "")) || 0 })
                }
              />
            </div>
            <p className="t-small mt-2 text-muted">
              Only hosts see this, in artist search. It never appears on your public page.
            </p>
          </div>

          <div>
            <Label>Clips</Label>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: artistProfile.clips }).map((_, i) => (
                <span
                  key={i}
                  className="grid h-16 w-24 place-items-center border border-line bg-surface-2 text-muted"
                  aria-label={`Clip ${i + 1}`}
                >
                  ▶
                </span>
              ))}
              <button
                type="button"
                onClick={() => {
                  updateArtistProfile({ clips: artistProfile.clips + 1 });
                  toast("Clip added");
                }}
                className="grid h-16 w-24 place-items-center border border-dashed border-line text-muted transition-colors hover:text-paper"
              >
                <Plus className="size-5" aria-hidden="true" />
                <span className="sr-only">Add clip</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live preview */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="t-micro">Preview</h2>
          <div className="mt-3 border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="grid size-12 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[18px] font-bold text-signal"
              >
                {artistProfile.name.charAt(0) || "?"}
              </span>
              <div className="min-w-0">
                <p className="t-h3 truncate">{artistProfile.name || "Your name"}</p>
                <p className="t-small truncate text-muted">
                  {artistProfile.genres.join(" · ") || "No genres yet"}
                </p>
              </div>
            </div>
            <p className="t-small mt-3 flex items-center gap-3 text-muted">
              <span className="t-mono">{rohan.gigsPlayed} gigs</span>
              <span className="flex items-center gap-1">
                <Star className="size-3 fill-brass text-brass" aria-hidden="true" />
                <span className="t-mono">{rohan.rating.toFixed(1)}</span>
              </span>
            </p>
            <p className="t-mono mt-2 text-[13px] text-brass">
              {money(artistProfile.feeMin)}–{money(artistProfile.feeMax)}
            </p>
            <p className="t-small mt-3 line-clamp-4 text-paper/85">
              {artistProfile.bio || "Add a bio so venues know what they're booking."}
            </p>
          </div>

          <p className="t-small mt-3 text-muted">
            {completeness < 100
              ? "Add clips and a photo to reach 100% — complete profiles get more offers."
              : "Complete. You'll show up higher in artist search."}
          </p>
        </aside>
      </div>
    </ConsoleShell>
  );
}
