import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarX, ImagePlus, Star, Trash2, X } from "lucide-react";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import { getCities, getGenres, getMyArtistProfile } from "@/lib/api";
import type { ApiCity, ApiGenre } from "@/lib/api";
import { money } from "@/lib/format";
import {
  apiMessage,
  availabilityDate,
  createArtistProfile,
  deleteArtistPhoto,
  feeNumber,
  isMissingProfile,
  readAvailability,
  rejectPhoto,
  saveArtistProfile,
  setPrimaryArtistPhoto,
  todayIso,
  uploadArtistPhoto,
  type ArtistDetail,
  type ArtistPhoto,
  type ArtistProfileWrite,
  type Availability,
} from "./artist-data";

/** The editable half of an artist profile, flattened for form state. */
interface Draft {
  stage_name: string;
  bio: string;
  city: string;
  genres: number[];
  fee_range_min: string;
  fee_range_max: string;
  instagram: string;
  youtube: string;
  website: string;
  availability: Availability;
}

function draftOf(artist: ArtistDetail): Draft {
  return {
    stage_name: artist.stage_name ?? "",
    bio: artist.bio ?? "",
    city: artist.city == null ? "" : String(artist.city),
    genres: artist.genres.map((g) => g.id),
    fee_range_min: artist.fee_range_min ?? artist.booking_fee_min ?? "",
    fee_range_max: artist.fee_range_max ?? artist.booking_fee_max ?? "",
    instagram: artist.instagram ?? "",
    youtube: artist.youtube ?? "",
    website: artist.website ?? "",
    availability: readAvailability(artist.availability),
  };
}

/** Decimals come back as "4000.00"; comparing raw strings would always be dirty. */
function sameFee(a: string, b: string): boolean {
  const an = feeNumber(a.trim());
  const bn = feeNumber(b.trim());
  return an === bn;
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.stage_name === b.stage_name &&
    a.bio === b.bio &&
    a.city === b.city &&
    a.instagram === b.instagram &&
    a.youtube === b.youtube &&
    a.website === b.website &&
    sameFee(a.fee_range_min, b.fee_range_min) &&
    sameFee(a.fee_range_max, b.fee_range_max) &&
    a.genres.length === b.genres.length &&
    a.genres.every((g) => b.genres.includes(g)) &&
    a.availability.notes === b.availability.notes &&
    a.availability.blackout_dates.length === b.availability.blackout_dates.length &&
    a.availability.blackout_dates.every((d) => b.availability.blackout_dates.includes(d))
  );
}

function toPayload(draft: Draft): ArtistProfileWrite {
  const fee = (v: string) => {
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  };
  return {
    stage_name: draft.stage_name.trim(),
    bio: draft.bio.trim(),
    city: draft.city === "" ? null : draft.city,
    genres: draft.genres,
    fee_range_min: fee(draft.fee_range_min),
    fee_range_max: fee(draft.fee_range_max),
    instagram: draft.instagram.trim(),
    youtube: draft.youtube.trim(),
    website: draft.website.trim(),
    availability: draft.availability,
  };
}

function clockStamp(): string {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Section 7.19 — profile builder, backed by /artists/mine/. */
export function ArtistProfileBuilderScreen() {
  const { toast } = useStore();

  const [artist, setArtist] = useState<ArtistDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The last state the server confirmed. Dirty = draft differs from this. */
  const [saved, setSaved] = useState<Draft | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const [genres, setGenres] = useState<ApiGenre[]>([]);
  const [cities, setCities] = useState<ApiCity[]>([]);
  const [refDataError, setRefDataError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const [genreToAdd, setGenreToAdd] = useState("");
  const [blockDate, setBlockDate] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError("");
    try {
      const data = (await getMyArtistProfile()) as ArtistDetail;
      setArtist(data);
      const next = draftOf(data);
      setDraft(next);
      setSaved(next);
      setLoadState("ready");
    } catch (err) {
      if (isMissingProfile(err)) {
        setLoadState("missing");
        return;
      }
      setLoadError(apiMessage(err, "Your profile didn't load. Try again."));
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let live = true;
    Promise.all([getGenres(), getCities()])
      .then(([g, c]) => {
        if (!live) return;
        setGenres(g);
        setCities(c);
      })
      .catch((err) => {
        if (!live) return;
        setRefDataError(
          apiMessage(err, "Genres and cities didn't load, so those two fields are unavailable."),
        );
      });
    return () => {
      live = false;
    };
  }, []);

  const dirty = Boolean(draft && saved && !sameDraft(draft, saved));

  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...changes } : d));
    setSaveError("");
  };

  const genreName = useCallback(
    (id: number) => genres.find((g) => g.id === id)?.name ?? artist?.genres.find((g) => g.id === id)?.name ?? "",
    [genres, artist],
  );

  const cityName = useMemo(() => {
    if (!draft) return "";
    if (draft.city === "") return "";
    return cities.find((c) => String(c.id) === draft.city)?.name ?? artist?.city_name ?? "";
  }, [draft, cities, artist]);

  const photos = artist?.photos ?? [];
  const cover = photos.find((p) => p.is_primary) ?? photos[0];

  const completeness = useMemo(() => {
    if (!draft) return 0;
    const min = feeNumber(draft.fee_range_min);
    const max = feeNumber(draft.fee_range_max);
    const checks = [
      photos.length > 0,
      draft.stage_name.trim().length > 0,
      draft.genres.length > 0,
      draft.city !== "",
      draft.bio.trim().length >= 40,
      min !== null && max !== null && max >= min && max > 0,
      Boolean(draft.instagram.trim() || draft.youtube.trim() || draft.website.trim()),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [draft, photos.length]);

  const save = async () => {
    if (!artist || !draft) return;
    if (draft.stage_name.trim() === "") {
      setSaveError("Add the name you perform under before saving — hosts search by it.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const updated = await saveArtistProfile(artist.id, toPayload(draft));
      // Re-read from the response, not the draft: the server normalises fees,
      // trims the availability note and sorts blocked dates. PATCH answers with
      // the same shape GET does, so this is the canonical profile.
      const confirmed = draftOf(updated);
      setArtist(updated);
      setDraft(confirmed);
      setSaved(confirmed);
      setSavedAt(clockStamp());
      toast("Profile saved", "success");
    } catch (err) {
      setSaveError(apiMessage(err, "Your profile didn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const createProfile = async () => {
    if (newName.trim() === "") return;
    setCreating(true);
    setLoadError("");
    try {
      const created = await createArtistProfile(newName.trim());
      setArtist(created);
      const next = draftOf(created);
      setDraft(next);
      setSaved(next);
      setLoadState("ready");
      toast("Profile created", "success");
    } catch (err) {
      setLoadError(apiMessage(err, "That didn't work. Try again."));
    } finally {
      setCreating(false);
    }
  };

  const onPickFile = async (file: File | undefined) => {
    if (!file || !artist) return;
    const rejection = rejectPhoto(file);
    if (rejection) {
      setPhotoError(rejection);
      return;
    }
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const photo = await uploadArtistPhoto(artist.id, file);
      setArtist((a) =>
        a
          ? {
              ...a,
              photos: photo.is_primary
                ? [...a.photos.map((p) => ({ ...p, is_primary: false })), photo]
                : [...a.photos, photo],
            }
          : a,
      );
      toast("Photo uploaded", "success");
    } catch (err) {
      setPhotoError(apiMessage(err, "That photo didn't upload. Try again."));
    } finally {
      setPhotoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const makeCover = async (photo: ArtistPhoto) => {
    if (!artist || photo.is_primary) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await setPrimaryArtistPhoto(artist.id, photo.id);
      setArtist((a) =>
        a
          ? { ...a, photos: a.photos.map((p) => ({ ...p, is_primary: p.id === photo.id })) }
          : a,
      );
    } catch (err) {
      setPhotoError(apiMessage(err, "Couldn't set that as your cover. Try again."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async (photo: ArtistPhoto) => {
    if (!artist) return;
    setPhotoBusy(true);
    setPhotoError("");
    try {
      await deleteArtistPhoto(artist.id, photo.id);
      setArtist((a) => {
        if (!a) return a;
        const rest = a.photos.filter((p) => p.id !== photo.id);
        // The server promotes a replacement cover; mirror that locally.
        if (photo.is_primary && rest.length > 0) rest[0] = { ...rest[0], is_primary: true };
        return { ...a, photos: rest };
      });
    } catch (err) {
      setPhotoError(apiMessage(err, "Couldn't remove that photo. Try again."));
    } finally {
      setPhotoBusy(false);
    }
  };

  const addBlackout = () => {
    if (!draft || !blockDate) return;
    if (draft.availability.blackout_dates.includes(blockDate)) {
      setBlockDate("");
      return;
    }
    patch({
      availability: {
        ...draft.availability,
        blackout_dates: [...draft.availability.blackout_dates, blockDate].sort(),
      },
    });
    setBlockDate("");
  };

  const removeBlackout = (iso: string) => {
    if (!draft) return;
    patch({
      availability: {
        ...draft.availability,
        blackout_dates: draft.availability.blackout_dates.filter((d) => d !== iso),
      },
    });
  };

  /* ---- non-ready states ------------------------------------------------- */

  if (loadState !== "ready" || !draft || !artist) {
    return (
      <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Profile"]}>
        <h1 className="t-h1">Your profile</h1>
        {loadState === "loading" && (
          <p className="t-body mt-6 border border-dashed border-line px-4 py-12 text-center text-muted">
            Loading your profile…
          </p>
        )}
        {loadState === "error" && (
          <div className="mt-6 border border-fault bg-surface p-5">
            <p className="t-body">{loadError}</p>
            <Button variant="primary" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        )}
        {loadState === "missing" && (
          <div className="mt-6 max-w-[46ch] border border-line bg-surface p-5">
            <h2 className="t-h3">No artist profile yet</h2>
            <p className="t-body mt-2 text-muted">
              Nothing is linked to this account. Start with the name you perform under — you can
              fill in genres, city, fee and photos straight after.
            </p>
            <Field label="Performing name" htmlFor="ap-new-name" className="mt-4">
              <Input
                id="ap-new-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Rohan Kalyan"
              />
            </Field>
            {loadError && <p className="t-small mt-3 text-fault">{loadError}</p>}
            <Button
              variant="primary"
              className="mt-4"
              disabled={creating || newName.trim() === ""}
              onClick={() => void createProfile()}
            >
              {creating ? "Creating…" : "Create my profile"}
            </Button>
          </div>
        )}
      </ConsoleShell>
    );
  }

  /* ---- editor ----------------------------------------------------------- */

  const unusedGenres = genres.filter((g) => !draft.genres.includes(g.id));
  const feeMin = feeNumber(draft.fee_range_min);
  const feeMax = feeNumber(draft.fee_range_max);

  return (
    <ConsoleShell
      nav={ARTIST_NAV}
      breadcrumb={["Profile"]}
      actions={
        <span className="hidden items-center gap-3 sm:flex">
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h1">Your profile</h1>
          <p className="t-body mt-2 max-w-[52ch] text-muted">
            Hosts search this. A photo, a filled-in fee range and your blocked dates are what turn a
            search result into an offer.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          <span className="t-mono text-[12px] text-muted" aria-live="polite">
            {dirty
              ? "Unsaved changes"
              : savedAt
                ? `Saved ${savedAt}`
                : "Everything here is live"}
          </span>
        </div>
      </div>

      {saveError && (
        <p className="t-small mt-4 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
          {saveError}
        </p>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Editor */}
        <div className="min-w-0 space-y-6">
          <div>
            <Label>Photos</Label>
            <p className="t-small mb-3 text-muted">
              The first one is your cover — it's the image a host sees in search results.
            </p>
            {photos.length > 0 && (
              <ul className="mb-3 flex flex-wrap gap-3">
                {photos.map((photo) => (
                  <li key={photo.id} className="w-[132px]">
                    <img
                      src={photo.image}
                      alt={photo.caption || `Photo of ${draft.stage_name || "you"}`}
                      className="h-[88px] w-[132px] border border-line object-cover"
                      loading="lazy"
                    />
                    <div className="mt-1 flex items-center justify-between gap-1">
                      {photo.is_primary ? (
                        <span className="t-mono flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-brass">
                          <Star className="size-3 fill-brass text-brass" aria-hidden="true" />
                          Cover
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={photoBusy}
                          onClick={() => void makeCover(photo)}
                          className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted transition-colors hover:text-paper disabled:opacity-50"
                        >
                          Make cover
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={photoBusy}
                        onClick={() => void removePhoto(photo)}
                        aria-label={`Remove photo ${photo.id}`}
                        className="text-muted transition-colors hover:text-fault disabled:opacity-50"
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {photos.length === 0 && (
              <p className="t-small mb-3 border border-dashed border-line px-4 py-6 text-center text-muted">
                No photos yet. A profile without one rarely gets booked.
              </p>
            )}
            <input
              ref={fileRef}
              id="ap-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => void onPickFile(e.target.files?.[0])}
            />
            <Button size="sm" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              <ImagePlus className="mr-2 size-4" aria-hidden="true" />
              {photoBusy ? "Working…" : "Add a photo"}
            </Button>
            <p className="t-small mt-2 text-muted">JPG, PNG or WebP, up to 5 MB.</p>
            {photoError && (
              <p className="t-small mt-2 text-fault" role="alert">
                {photoError}
              </p>
            )}
          </div>

          <Field label="Performing name" htmlFor="ap-name">
            <Input
              id="ap-name"
              value={draft.stage_name}
              onChange={(e) => patch({ stage_name: e.target.value })}
            />
          </Field>

          <div>
            <Label>Genres</Label>
            {draft.genres.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {draft.genres.map((id) => (
                  <span
                    key={id}
                    className="flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-[14px]"
                  >
                    {genreName(id) || `Genre ${id}`}
                    <button
                      type="button"
                      onClick={() => patch({ genres: draft.genres.filter((x) => x !== id) })}
                      aria-label={`Remove ${genreName(id)}`}
                      className="text-muted transition-colors hover:text-fault"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex gap-2">
              <select
                aria-label="Add a genre"
                value={genreToAdd}
                disabled={genres.length === 0}
                onChange={(e) => setGenreToAdd(e.target.value)}
                className="field flex-1"
              >
                <option value="">
                  {genres.length === 0 ? "Genres unavailable" : "Add a genre…"}
                </option>
                {unusedGenres.map((g) => (
                  <option key={g.id} value={String(g.id)} className="bg-surface">
                    {g.name}
                  </option>
                ))}
              </select>
              <Button
                disabled={!genreToAdd}
                onClick={() => {
                  patch({ genres: [...draft.genres, Number(genreToAdd)] });
                  setGenreToAdd("");
                }}
              >
                Add
              </Button>
            </div>
          </div>

          <Field label="City" htmlFor="ap-city">
            <Select
              id="ap-city"
              value={draft.city}
              onChange={(v) => patch({ city: v })}
              options={[
                { value: "", label: cities.length === 0 ? "Cities unavailable" : "Pick your city…" },
                ...cities.map((c) => ({ value: String(c.id), label: c.name })),
              ]}
            />
          </Field>

          {refDataError && <p className="t-small text-fault">{refDataError}</p>}

          <Field
            label="Bio"
            htmlFor="ap-bio"
            hint="Two sentences is plenty. Say what you actually play."
          >
            <Textarea
              id="ap-bio"
              rows={4}
              value={draft.bio}
              onChange={(e) => patch({ bio: e.target.value })}
            />
          </Field>

          <div>
            <Label>Fee range</Label>
            <div className="flex items-center gap-3">
              <Input
                aria-label="Minimum fee"
                inputMode="numeric"
                className="t-mono w-[120px]"
                value={draft.fee_range_min}
                onChange={(e) => patch({ fee_range_min: e.target.value.replace(/[^\d.]/g, "") })}
              />
              <span className="t-small text-muted">to</span>
              <Input
                aria-label="Maximum fee"
                inputMode="numeric"
                className="t-mono w-[120px]"
                value={draft.fee_range_max}
                onChange={(e) => patch({ fee_range_max: e.target.value.replace(/[^\d.]/g, "") })}
              />
            </div>
            <p className="t-small mt-2 text-muted">
              Only hosts see this, in artist search. It never appears on your public page.
            </p>
            {feeMin !== null && feeMax !== null && feeMax < feeMin && (
              <p className="t-small mt-2 text-fault">
                The top of the range needs to be at least the bottom.
              </p>
            )}
          </div>

          <div>
            <Label>Dates you can't play</Label>
            <p className="t-small mb-3 text-muted">
              Block a date and hosts see it on your public page, so they stop asking whether you're
              free on the 14th.
            </p>
            {draft.availability.blackout_dates.length > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {draft.availability.blackout_dates.map((iso) => (
                  <li
                    key={iso}
                    className="t-mono flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-[13px]"
                  >
                    {availabilityDate(iso)}
                    <button
                      type="button"
                      onClick={() => removeBlackout(iso)}
                      aria-label={`Unblock ${availabilityDate(iso)}`}
                      className="text-muted transition-colors hover:text-fault"
                    >
                      <X className="size-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="t-small text-muted">
                Nothing blocked — your page says you're open to any date.
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Input
                aria-label="Date to block"
                type="date"
                min={todayIso()}
                className="t-mono flex-1"
                value={blockDate}
                onChange={(e) => setBlockDate(e.target.value)}
              />
              <Button disabled={!blockDate} onClick={addBlackout}>
                Block
              </Button>
            </div>
            <Field
              label="Availability note"
              htmlFor="ap-avail-notes"
              hint="Optional, 280 characters. Something like: weekends only until December."
              className="mt-4"
            >
              <Textarea
                id="ap-avail-notes"
                rows={2}
                maxLength={280}
                value={draft.availability.notes}
                onChange={(e) =>
                  patch({ availability: { ...draft.availability, notes: e.target.value } })
                }
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Instagram" htmlFor="ap-instagram">
              <Input
                id="ap-instagram"
                value={draft.instagram}
                onChange={(e) => patch({ instagram: e.target.value })}
                placeholder="handle"
              />
            </Field>
            <Field label="YouTube" htmlFor="ap-youtube">
              <Input
                id="ap-youtube"
                type="url"
                value={draft.youtube}
                onChange={(e) => patch({ youtube: e.target.value })}
                placeholder="https://…"
              />
            </Field>
            <Field label="Website" htmlFor="ap-website">
              <Input
                id="ap-website"
                type="url"
                value={draft.website}
                onChange={(e) => patch({ website: e.target.value })}
                placeholder="https://…"
              />
            </Field>
          </div>

          <div className="flex items-center gap-3 border-t border-line pt-5">
            <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
            {dirty && (
              <Button
                onClick={() => {
                  setDraft(saved);
                  setSaveError("");
                }}
                disabled={saving}
              >
                Discard
              </Button>
            )}
          </div>
        </div>

        {/* Live preview — the artist's own row, not a sample */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="t-micro">Preview</h2>
          <div className="mt-3 border border-line bg-surface p-4">
            <div className="flex items-center gap-3">
              {cover ? (
                <img
                  src={cover.image}
                  alt=""
                  className="size-12 shrink-0 border border-line object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="grid size-12 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[18px] font-bold text-signal"
                >
                  {draft.stage_name.charAt(0) || "?"}
                </span>
              )}
              <div className="min-w-0">
                <p className="t-h3 truncate">{draft.stage_name || "Your name"}</p>
                <p className="t-small truncate text-muted">
                  {draft.genres.map(genreName).filter(Boolean).join(" · ") || "No genres yet"}
                </p>
              </div>
            </div>

            <p className="t-small mt-3 text-muted">{cityName || "No city set"}</p>

            {artist.total_gigs > 0 && (
              <p className="t-mono mt-2 text-[13px] text-muted">{artist.total_gigs} gigs on Naada</p>
            )}

            <p className="t-mono mt-2 text-[13px] text-brass">
              {feeMin !== null && feeMax !== null
                ? `${money(feeMin)}–${money(feeMax)}`
                : "No fee range set"}
            </p>

            <p className="t-small mt-3 line-clamp-4 text-paper/85">
              {draft.bio || "Add a bio so hosts know what they're booking."}
            </p>

            <p className="t-small mt-3 flex items-center gap-2 border-t border-line pt-3 text-muted">
              <CalendarX className="size-3.5 shrink-0" aria-hidden="true" />
              {draft.availability.blackout_dates.length > 0
                ? `${draft.availability.blackout_dates.length} date${
                    draft.availability.blackout_dates.length === 1 ? "" : "s"
                  } blocked`
                : "Open to any date"}
            </p>
          </div>

          <p className="t-small mt-3 text-muted">
            {completeness < 100
              ? "Photos, a fee range and a link fill the rest of the meter — complete profiles get more offers."
              : "Complete. You'll show up higher in artist search."}
          </p>
          {dirty && (
            <p className="t-small mt-2 text-brass">
              This preview shows your unsaved edits. Save to publish them.
            </p>
          )}
        </aside>
      </div>
    </ConsoleShell>
  );
}
