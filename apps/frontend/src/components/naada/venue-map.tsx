import { MapPin, Navigation } from "lucide-react";
import { addressLine, directionsUrl, type VenueSpot } from "@/lib/venue-map";

/** The venue's address and a "Get directions" link. */
export function VenueMap({ spot, className = "" }: { spot: VenueSpot; className?: string }) {
  const address = addressLine(spot);
  const directions = directionsUrl(spot);

  if (!address && !directions) return null;

  return (
    <div className={className}>
      {address && (
        <p className="t-small flex items-start gap-2 text-muted">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{address}</span>
        </p>
      )}
      {directions && (
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary btn-sm mt-3"
        >
          <Navigation className="size-4" aria-hidden="true" />
          Get directions
        </a>
      )}
    </div>
  );
}
