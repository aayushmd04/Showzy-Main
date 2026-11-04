/**
 * Warm the page code a visitor is likely to open next.
 *
 * Most pages are loaded on demand so the first visit stays light. The cost is a
 * wait the first time someone opens one (Terms, Privacy and Cookies were the
 * worst: a footer click on a slow connection meant a blank page). The calls
 * below fetch a page's code ahead of the click: when the browser is idle after
 * the home page has settled, and the moment a pointer or finger moves toward a
 * link. A dynamic import() is cached by the browser, so the later navigation
 * finds the code already there.
 */

type Loader = () => Promise<unknown>;

const ROUTES: Array<[RegExp, Loader]> = [
  [/^\/artists\/?$/, () => import("@/screens/artists")],
  [/^\/a\//, () => import("@/screens/artist-profile")],
  [/^\/venues\/?$/, () => import("@/screens/venues")],
  [/^\/v\//, () => import("@/screens/venue-profile")],
  [/^\/explore\/?$/, () => import("@/screens/explore")],
  [/^\/how-it-works\/?$/, () => import("@/screens/how-it-works")],
  [/^\/(terms|privacy|refunds|cookies|contact)\/?$/, () => import("@/screens/legal")],
  [/^\/tickets\/?$/, () => import("@/screens/my-tickets")],
  [/^\/ticket\//, () => import("@/screens/ticket-detail")],
];

const started = new Set<Loader>();

/** Start loading the code for `pathname`, once. Failures are ignored: the real navigation will retry. */
export function prefetchRoute(pathname: string): void {
  for (const [pattern, load] of ROUTES) {
    if (!pattern.test(pathname) || started.has(load)) continue;
    started.add(load);
    load().catch(() => started.delete(load));
  }
}

/** The path of an in-app link, or null for anything leaving the site. */
export function internalPath(anchor: HTMLAnchorElement): string | null {
  if (anchor.target && anchor.target !== "_self") return null;
  try {
    const url = new URL(anchor.href, window.location.href);
    return url.origin === window.location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/** Prefetch the public pages once the browser has nothing better to do. */
export function prefetchPublicPagesWhenIdle(): () => void {
  const paths = ["/artists", "/venues", "/explore", "/how-it-works", "/terms"];
  const run = () => paths.forEach(prefetchRoute);
  // Never on a connection that has asked us to save data.
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return () => {};
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
  if (ric) {
    const id = ric(run, { timeout: 4000 });
    return () => (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
  }
  const t = window.setTimeout(run, 2500);
  return () => window.clearTimeout(t);
}
