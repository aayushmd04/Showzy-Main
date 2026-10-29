import { useState } from "react";
import { MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addressLine, coordinatesOf, directionsUrl, embedUrl, type VenueSpot } from "@/lib/venue-map";

/**
 * The address, a "Get directions" link, and — when the host has dropped a pin —
 * a map. The map is a third-party page (OpenStreetMap), so nothing is requested
 * from it until the guest asks to see it.
 */
export function VenueMap({ spot, className = "" }: { spot: VenueSpot; className?: string }) {
  const [shown, setShown] = useState(false);
  const address = addressLine(spot);
  const directions = directionsUrl(spot);
  const pin = coordinatesOf(spot);

  if (!address && !directions) return null;

  return (
    <div className={className}>
      {address && (
        <p className="t-small flex items-start gap-2 text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{address}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {directions && (
          <a
            href={directions}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
          >
            <Navigation className="size-4" aria-hidden="true" />
            Get directions
          </a>
        )}
        {pin && !shown && (
          <Button size="sm" onClick={() => setShown(true)}>
            Show map
          </Button>
        )}
      </div>

      {pin && shown && (
        <div className="mt-3">
          <iframe
            title={`Map of ${spot.name ?? "the venue"}`}
            src={embedUrl(pin)}
            className="h-[260px] w-full border border-line"
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin"
          />
          <p className="t-small mt-1 text-muted">
            Map © OpenStreetMap contributors. Loaded because you asked to see it.
          </p>
        </div>
      )}
    </div>
  );
}
