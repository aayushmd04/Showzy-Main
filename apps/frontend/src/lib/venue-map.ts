/**
 * Where a venue is, as links a guest can follow.
 *
 * Everything that ends up in an `href` or an `<iframe src>` is rebuilt here from
 * validated parts, never passed through from the API as-is: a venue's maps link
 * is typed by a host, and a `javascript:` address in an anchor is a script.
 */

export interface VenueSpot {
  name?: string;
  address_line1?: string;
  address_line2?: string;
  pincode?: string;
  area_name?: string;
  city_name?: string;
  lat?: string | number | null;
  lng?: string | number | null;
  google_maps_url?: string;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

/** The URL only if it is plain http(s); otherwise null. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/** The venue's pin, if it has a valid one (both halves, on the planet). */
export function coordinatesOf(spot: Pick<VenueSpot, "lat" | "lng">): Coordinates | null {
  if (spot.lat === null || spot.lat === undefined || spot.lat === "") return null;
  if (spot.lng === null || spot.lng === undefined || spot.lng === "") return null;
  const lat = Number(spot.lat);
  const lng = Number(spot.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Read a pin out of what a host pastes: "12.2958, 76.6394", "12.2958 76.6394",
 * or a Google Maps URL containing "@12.2958,76.6394" or "!3d12.29!4d76.63".
 */
export function parseCoordinates(text: string): Coordinates | null {
  const t = text.trim();
  if (!t) return null;
  const fromUrl =
    /@(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(t) ??
    /!3d(-?\d{1,2}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/.exec(t);
  const plain = /^(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)$/.exec(t);
  const m = fromUrl ?? plain;
  if (!m) return null;
  return coordinatesOf({ lat: m[1], lng: m[2] });
}

/** One line a person would read out: "12, 4th Main, Vijayanagar, Mysuru 570017". */
export function addressLine(spot: VenueSpot): string {
  return [spot.address_line1, spot.address_line2, spot.area_name, spot.city_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ")
    .concat(spot.pincode ? ` ${spot.pincode.trim()}` : "");
}

/**
 * Where "Get directions" goes. The host's own Maps link wins (it is the one that
 * lands on the right door); then the pin; then a search for the address.
 */
export function directionsUrl(spot: VenueSpot): string | null {
  const own = safeHttpUrl(spot.google_maps_url);
  if (own) return own;
  const pin = coordinatesOf(spot);
  if (pin) {
    return `https://www.google.com/maps/dir/?api=1&destination=${pin.lat},${pin.lng}`;
  }
  const address = [spot.name, addressLine(spot)].filter(Boolean).join(", ");
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

/** OpenStreetMap's embeddable view centred on the pin, about 500 m across. */
export function embedUrl(pin: Coordinates): string {
  const d = 0.0035;
  const bbox = [pin.lng - d, pin.lat - d, pin.lng + d, pin.lat + d].map((n) => n.toFixed(6)).join(",");
  return (
    "https://www.openstreetmap.org/export/embed.html" +
    `?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${pin.lat.toFixed(6)}%2C${pin.lng.toFixed(6)}`
  );
}
