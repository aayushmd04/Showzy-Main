/**
 * Clear what this browser keeps about the person who just signed out or
 * deleted their account — so the next person on a shared phone or library
 * computer doesn't inherit it.
 *
 * Deliberately leaves the offline door-scan queue alone: it holds only opaque
 * QR codes, and wiping it on sign-out would silently lose check-ins that
 * haven't reached the server yet.
 */
export function clearPersonalLocalData(): void {
  try {
    localStorage.removeItem("naada_venue_layout"); // unsaved floor-plan draft
  } catch {
    /* storage blocked */
  }
  try {
    // The service worker keeps a copy of the ticket list (and QR images) for
    // opening a ticket offline at the door. They belong to the old account.
    void caches?.keys().then((names) =>
      Promise.all(names.filter((n) => n.includes("tickets")).map((n) => caches.delete(n))),
    );
  } catch {
    /* Cache API unavailable */
  }
}
