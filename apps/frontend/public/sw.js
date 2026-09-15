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

// Bump this whenever the caching strategy changes. The activate handler
// deletes every cache whose name isn't in KEEP, so a new VERSION is what
// evicts the previous worker's entries — without it, browsers that already
// installed v1 would keep serving the stale `/` it had precached, which is
// the exact problem the navigation handler below was changed to fix.
const VERSION = "naada-v2";
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

  if (url.origin !== self.location.origin) return;

  // ── The HTML document: always ask the network first ──────────────────────
  //
  // This used to be cache-first with a background refresh, and that is the
  // classic way to ship a fix nobody receives. index.html names the build's
  // content-hashed assets, so serving yesterday's copy from cache runs
  // yesterday's entire application — and since VERSION is a constant that
  // never changes between builds, the activate handler never cleared it
  // either. A returning visitor stayed on the old version for at least one
  // more visit, with nothing to explain why the deploy "didn't work".
  //
  // The document is small and the only file that has to be fresh. Fall back
  // to the cached shell only when the network genuinely fails, which is the
  // case this whole worker exists for: a ticket at a venue door on bad signal.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL);
        try {
          const res = await fetch(request);
          if (res.ok) cache.put("/", res.clone());
          return res;
        } catch {
          const shell = (await cache.match(request)) || (await cache.match("/"));
          if (shell) return shell;
          throw new Error("offline and no shell cached");
        }
      })(),
    );
    return;
  }

  // ── Build assets: cache-first, and no revalidation ───────────────────────
  // Vite fingerprints these with a content hash, so a given URL's bytes can
  // never change. Re-fetching one to check is spent bandwidth on a phone.
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      const hit = await cache.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      if (res.ok) cache.put(request, res.clone());
      return res;
    })(),
  );
});
