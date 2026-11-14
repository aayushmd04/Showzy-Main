import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ConsentCheck, PolicyLink } from "@/components/naada/consent-check";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getCities, getGenres } from "@/lib/api";
import type { ApiCity, ApiGenre } from "@/lib/api";

/**
 * The two "what we need to know" forms: a host's venue and an artist's profile.
 * Shared by sign-up (new accounts) and by the in-app setup prompt (accounts that
 * existed before sign-up asked), so both collect exactly the same things.
 */

function useReferenceList<T>(loader: () => Promise<T[]>): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    let alive = true;
    loader().then((data) => { if (alive) setItems(data); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return items;
}

/**
 * Required fields for a working artist profile — stage name, city, at least
 * one genre, and a real bio. Selecting "artist" already created a bare
 * `Artist` row server-side with a throwaway stage name; this is what
 * actually fills it in, before the artist ever reaches their dashboard.
 */
export function ArtistRequiredStep({
  loading,
  error,
  onSubmit,
  initial,
  intro,
}: {
  loading: boolean;
  error: string;
  onSubmit: (data: { name: string; stageName: string; city: string; genres: number[]; bio: string }) => void;
  /** What an existing account already has, so it is asked only for what is missing. */
  initial?: Partial<{ name: string; stageName: string; city: string; genres: number[]; bio: string }>;
  intro?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [stageName, setStageName] = useState(initial?.stageName ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [genres, setGenres] = useState<number[]>(initial?.genres ?? []);
  const [genreToAdd, setGenreToAdd] = useState("");
  const [bio, setBio] = useState(initial?.bio ?? "");
  const [agree, setAgree] = useState(false);

  const cities = useReferenceList<ApiCity>(getCities);
  const allGenres = useReferenceList<ApiGenre>(getGenres);
  const unusedGenres = allGenres.filter((g) => !genres.includes(g.id));
  const genreName = (id: number) => allGenres.find((g) => g.id === id)?.name;

  const bioOk = bio.trim().length >= 10;
  const canSubmit = name.trim() && stageName.trim() && city && genres.length > 0 && bioOk && agree && !loading;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit({ name: name.trim(), stageName: stageName.trim(), city, genres, bio: bio.trim() });
      }}
    >
      <p className="t-small text-muted mb-4">
        {intro ?? "Venue hosts book off this — the more real it is, the better the fit."}
      </p>

      <Field label="Your name" htmlFor="ar-name">
        <Input id="ar-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!name} required />
      </Field>

      <Field label="Stage / performing name" htmlFor="ar-stage" className="mt-4">
        <Input id="ar-stage" value={stageName} onChange={(e) => setStageName(e.target.value)} required />
      </Field>

      <Field label="City" htmlFor="ar-city" className="mt-4">
        <Select
          id="ar-city"
          value={city}
          onChange={setCity}
          options={[
            { value: "", label: cities.length === 0 ? "Loading cities…" : "Pick your city…" },
            ...cities.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>

      <div className="mt-4">
        <Label>Genres — pick at least one</Label>
        {genres.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {genres.map((id) => (
              <span key={id} className="flex items-center gap-2 border border-line bg-surface px-3 py-1.5 text-[14px]">
                {genreName(id) ?? `Genre ${id}`}
                <button
                  type="button"
                  onClick={() => setGenres(genres.filter((x) => x !== id))}
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
            disabled={allGenres.length === 0}
            onChange={(e) => setGenreToAdd(e.target.value)}
            className="field flex-1"
          >
            <option value="">{allGenres.length === 0 ? "Loading genres…" : "Add a genre…"}</option>
            {unusedGenres.map((g) => (
              <option key={g.id} value={String(g.id)} className="bg-surface">{g.name}</option>
            ))}
          </select>
          <Button
            type="button"
            disabled={!genreToAdd}
            onClick={() => { setGenres([...genres, Number(genreToAdd)]); setGenreToAdd(""); }}
          >
            Add
          </Button>
        </div>
      </div>

      <Field label="Bio" htmlFor="ar-bio" className="mt-4" hint={`${bio.length}/500 · a sentence or two is enough`}>
        <Textarea
          id="ar-bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="What you play, your influences, how long you've been performing…"
          maxLength={500}
          className="h-[80px] resize-none"
        />
      </Field>

      <ConsentCheck id="ar-agree" checked={agree} onChange={setAgree} className="mt-4">
        I agree to the <PolicyLink to="/terms">Terms</PolicyLink> for artists, including that Showzy holds
        booking fees in escrow and checks my identity and bank details (KYC) before paying me, and that hosts
        can see this profile.
      </ConsentCheck>

      {error && <p className="t-small mt-3 text-fault" role="alert">{error}</p>}

      <Button type="submit" variant="primary" full className="mt-5" disabled={!canSubmit}>
        {loading ? "Saving…" : "Finish setting up"}
      </Button>
    </form>
  );
}

/**
 * Required fields for a working venue — name, address, city, capacity.
 * Nothing was ever created for a host before this; this is where their
 * `Venue` row actually gets made, before they reach their console.
 */
export function HostRequiredStep({
  loading,
  error,
  onSubmit,
  initial,
  intro,
}: {
  loading: boolean;
  error: string;
  onSubmit: (data: { name: string; venueName: string; address: string; city: string; capacity: number }) => void;
  initial?: Partial<{ name: string }>;
  intro?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [venueName, setVenueName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [capacity, setCapacity] = useState("");
  const [agree, setAgree] = useState(false);

  const cities = useReferenceList<ApiCity>(getCities);

  const capacityNum = Number(capacity);
  const canSubmit =
    name.trim() && venueName.trim() && address.trim() && city &&
    capacity.trim() && capacityNum > 0 && agree && !loading;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) {
          onSubmit({ name: name.trim(), venueName: venueName.trim(), address: address.trim(), city, capacity: capacityNum });
        }
      }}
    >
      <p className="t-small text-muted mb-4">
        {intro ?? "Artists and fans need to know where you are and how big the room is before your first event can go live."}
      </p>

      <Field label="Your name" htmlFor="hr-name">
        <Input id="hr-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!name} required />
      </Field>

      <Field label="Venue name" htmlFor="hr-venue" className="mt-4">
        <Input id="hr-venue" value={venueName} onChange={(e) => setVenueName(e.target.value)} required />
      </Field>

      <Field label="Address" htmlFor="hr-address" className="mt-4">
        <Input id="hr-address" value={address} onChange={(e) => setAddress(e.target.value)} required />
      </Field>

      <Field label="City" htmlFor="hr-city" className="mt-4">
        <Select
          id="hr-city"
          value={city}
          onChange={setCity}
          options={[
            { value: "", label: cities.length === 0 ? "Loading cities…" : "Pick your city…" },
            ...cities.map((c) => ({ value: c.id, label: c.name })),
          ]}
        />
      </Field>

      <Field label="Capacity" htmlFor="hr-capacity" className="mt-4" hint="How many people fit, roughly">
        <Input
          id="hr-capacity"
          type="number"
          inputMode="numeric"
          min={1}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
          required
        />
      </Field>

      <ConsentCheck id="hr-agree" checked={agree} onChange={setAgree} className="mt-4">
        I confirm I'm authorised to list this venue and agree to the <PolicyLink to="/terms">Terms</PolicyLink>{" "}
        for hosts: I'm responsible for my events, my floor plan and anyone I invite to check tickets, and Showzy
        will verify my identity and bank details (KYC) before paying me.
      </ConsentCheck>

      {error && <p className="t-small mt-3 text-fault" role="alert">{error}</p>}

      <Button type="submit" variant="primary" full className="mt-5" disabled={!canSubmit}>
        {loading ? "Saving…" : "Finish setting up"}
      </Button>
    </form>
  );
}

