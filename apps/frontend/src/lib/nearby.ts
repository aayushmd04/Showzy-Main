/**
 * "Events in your area": ask the browser for a location, map it to the
 * nearest city Naada lists, and hand that to the discover feed.
 *
 * Nothing leaves the device: coordinates are compared against the city
 * centres below and then dropped; only the resulting city name is kept (for
 * this tab's session) so the feed can filter by it.
 */

const CITY_CENTRES: { name: string; lat: number; lng: number }[] = [
  { name: "Bengaluru", lat: 12.9716, lng: 77.5946 },
  { name: "Mysuru", lat: 12.2958, lng: 76.6394 },
];

const KEY = "naada.nearbyCity";
export const NEARBY_EVENT = "naada:nearby-city";

function km(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(rad(bLat - aLat) / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(rad(bLng - aLng) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/**
 * The listed city nearest to a point. There is deliberately no distance cutoff:
 * "near you" means your closest city, and events are filtered by city, not by
 * how far each venue is from you.
 */
export function nearestCity(lat: number, lng: number): string {
  let best = CITY_CENTRES[0];
  let bestKm = Infinity;
  for (const c of CITY_CENTRES) {
    const d = km(lat, lng, c.lat, c.lng);
    if (d < bestKm) {
      best = c;
      bestKm = d;
    }
  }
  return best.name;
}

/** "all" means no preference: Mysuru and Bengaluru mixed. */
export function getNearbyCity(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setNearbyCity(city: string): void {
  try {
    sessionStorage.setItem(KEY, city);
  } catch {
    /* private mode: the event below still reaches a mounted feed */
  }
  window.dispatchEvent(new CustomEvent(NEARBY_EVENT, { detail: city }));
}

export type LocateResult =
  | { status: "city"; city: string }
  | { status: "denied" }
  | { status: "unavailable" };

export function locateCity(): Promise<LocateResult> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ status: "unavailable" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({ status: "city", city: nearestCity(pos.coords.latitude, pos.coords.longitude) });
      },
      (err) => resolve({ status: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}
