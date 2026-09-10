/*
 * Naada service worker.
 *
 * One job that matters: a ticket has to open at a venue door, indoors, on
 * congested signal. Everything else here is in service of that.
 *
 * Strategy:
 *   - App shell and build assets: cache-first, so the page paints offline.
 *   - Ticket QR images: cache-first and kept, because that is the thing being
 *     shown at the door.
 *   - The tickets API: network-first with a cached fallback, so a stale ticket
 *     list still renders when the network is gone.
 *   - Everything else: straight to the network, untouched. Payments and
 *     check-ins must never be served from a cache.
 */

const VERSION = "naada-v1";
const SHELL = `${VERSION}-shell`;
const TICKETS = `${VERSION}-tickets`;
const KEEP = [SHELL, TICKETS];

const SHELL_URLS = ["/", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {
        // A missing shell file must not block activation.
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Never let a cache answer for anything that moves money or state. */
function isUnsafeToCache(url) {
  return (
    /\/payments\//.test(url.pathname) ||
    /\/auth\//.test(url.pathname) ||
    /\/tickets\/scan\//.test(url.pathname) ||
    /\/ticket-orders\//.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (isUnsafeToCache(url)) return;

  // The QR itself — the one asset that must survive a dead network.
  if (/\/media\/tickets\/qr\//.test(url.pathname)) {
    event.respondWith(
      caches.open(TICKETS).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // My tickets: fresh when possible, last-known when not.
  if (/\/tickets\/mine\//.test(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(TICKETS);
        try {
          const res = await fetch(request);
          if (res.ok) cache.put(request, res.clone());
          return res;
        } catch {
          const hit = await cache.match(request);
          if (hit) return hit;
          throw new Error("offline and nothing cached");
        }
      })(),
    );
    return;
  }

  // Same-origin navigations and build assets: paint offline.
  if (url.origin === self.location.origin) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        const hit = await cache.match(request);
        if (hit) {
          // Refresh in the background; the user still gets the instant paint.
          fetch(request)
            .then((res) => res.ok && cache.put(request, res.clone()))
            .catch(() => {});
          return hit;
        }
        try {
          const res = await fetch(request);
          if (res.ok && request.destination !== "document") {
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          if (request.mode === "navigate") {
            const shell = await cache.match("/");
            if (shell) return shell;
          }
          throw new Error("offline");
        }
      })(),
    );
  }
});
