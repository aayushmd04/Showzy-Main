import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { VenueMap } from "@/components/naada/venue-map";
import { actionError } from "@/components/naada/api-message";
import { getVenue, updateVenue, type ApiVenue } from "@/lib/api";
import { normaliseLink, safeHttpUrl } from "@/lib/venue-map";

interface Draft {
  address_line1: string;
  address_line2: string;
  pincode: string;
  google_maps_url: string;
}

function draftOf(v: ApiVenue): Draft {
  return {
    address_line1: v.address_line1 ?? "",
    address_line2: v.address_line2 ?? "",
    pincode: v.pincode ?? "",
    google_maps_url: v.google_maps_url ?? "",
  };
}

/**
 * Where guests find the venue: address, a Google Maps link, and a pin. Saves on
 * its own — a location change has nothing to do with payout details, and must
 * never send the venue's KYC back for review.
 */
export function VenueLocationCard({ slug, name }: { slug: string; name: string }) {
  const [venue, setVenue] = useState<ApiVenue | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    getVenue(slug)
      .then((v) => {
        if (!alive) return;
        setVenue(v);
        const d = draftOf(v);
        setDraft(d);
        setSaved(d);
      })
      .catch((err) => alive && setLoadError(actionError(err, "load your venue's location")));
    return () => {
      alive = false;
    };
  }, [slug]);

  if (loadError) {
    return (
      <p className="t-small mt-8 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
        {loadError}
      </p>
    );
  }
  if (!venue || !draft || !saved) return null;

  const patch = (changes: Partial<Draft>) => {
    setDraft({ ...draft, ...changes });
    setJustSaved(false);
    setError("");
  };

  const link = normaliseLink(draft.google_maps_url);
  const linkProblem = link && !safeHttpUrl(link) ? "That doesn't look like a web address." : "";
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const invalid = Boolean(linkProblem || !draft.address_line1.trim());

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const updated = await updateVenue(slug, {
        address_line1: draft.address_line1.trim(),
        address_line2: draft.address_line2.trim(),
        pincode: draft.pincode.trim(),
        google_maps_url: link,
      });
      setVenue({ ...venue, ...updated });
      const next = draftOf({ ...venue, ...updated });
      setDraft(next);
      setSaved(next);
      setJustSaved(true);
    } catch (err) {
      setError(actionError(err, "save your venue's location"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-10 max-w-[520px] border-t border-line pt-6" aria-labelledby="venue-location-h">
      <h2 id="venue-location-h" className="t-section">
        Location
      </h2>
      <p className="t-small mt-1 text-muted">
        Guests see this on your event pages, with a "Get directions" button.
      </p>

      <div className="mt-4 space-y-4">
        <Field label="Address" htmlFor="vl-address1">
          <Input
            id="vl-address1"
            value={draft.address_line1}
            onChange={(e) => patch({ address_line1: e.target.value })}
            maxLength={200}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Landmark / second line" htmlFor="vl-address2">
            <Input
              id="vl-address2"
              value={draft.address_line2}
              onChange={(e) => patch({ address_line2: e.target.value })}
              maxLength={200}
            />
          </Field>
          <Field label="Pincode" htmlFor="vl-pincode">
            <Input
              id="vl-pincode"
              inputMode="numeric"
              value={draft.pincode}
              onChange={(e) => patch({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
              className="t-mono"
            />
          </Field>
        </div>
        <Field
          label="Google Maps link"
          htmlFor="vl-link"
          hint="Open your venue in Google Maps → Share → Copy link, and paste it here. Guests get a “Get directions” button that opens it."
        >
          <Input
            id="vl-link"
            value={draft.google_maps_url}
            onChange={(e) => patch({ google_maps_url: e.target.value })}
            placeholder="https://maps.app.goo.gl/…"
            aria-invalid={linkProblem ? true : undefined}
          />
          {linkProblem && <p className="t-small mt-1 text-fault">{linkProblem}</p>}
        </Field>
      </div>

      {error && (
        <p className="t-small mt-4 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
          {error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty || invalid}>
          {saving ? "Saving…" : "Save location"}
        </Button>
        {dirty && (
          <Button onClick={() => { setDraft(saved); setError(""); }} disabled={saving}>
            Discard
          </Button>
        )}
        {justSaved && !dirty && (
          <span className="t-small text-live" aria-live="polite">
            Saved
          </span>
        )}
      </div>

      <div className="mt-6">
        <p className="t-micro">What guests see</p>
        <div className="mt-2 border border-line bg-surface p-4">
          <p className="t-h3">{name}</p>
          <VenueMap
            className="mt-3"
            spot={{
              name,
              address_line1: draft.address_line1,
              address_line2: draft.address_line2,
              pincode: draft.pincode,
              area_name: venue.area_name,
              city_name: venue.city_name,
              google_maps_url: linkProblem ? "" : link,
            }}
          />
        </div>
      </div>
    </section>
  );
}
