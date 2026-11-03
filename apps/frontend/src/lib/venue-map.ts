/**
 * Where a venue is, as a link a guest can follow.
 *
 * The host pastes their Google Maps link once; guests get a "Get directions"
 * button. Anything that ends up in an `href` is checked here first: a venue's
 * link is typed by a host, and a `javascript:` address in an anchor is a script.
 */

export interface VenueSpot {
  name?: string;
  address_line1?: string;
  address_line2?: string;
  pincode?: string;
  area_name?: string;
  city_name?: string;
  google_maps_url?: string;
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

/** What a host typed, made into a web address (people leave off the https://). */
export function normaliseLink(text: string): string {
  const t = text.trim();
  return t && !/^[a-z][a-z0-9+.-]*:/i.test(t) ? `https://${t}` : t;
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
 * Where "Get directions" goes: the host's own Maps link if it is a safe web
 * address (it lands on the right door), otherwise a Maps search for the address.
 */
export function directionsUrl(spot: VenueSpot): string | null {
  const own = safeHttpUrl(spot.google_maps_url);
  if (own) return own;
  const address = [spot.name, addressLine(spot)].filter(Boolean).join(", ");
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
