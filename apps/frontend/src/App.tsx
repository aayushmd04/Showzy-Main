import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig, motion } from "motion/react";

import { AppStoreProvider } from "@/store/app-store";
import { HostBranchProvider } from "@/components/naada/host-branch";
import { AuthSheetProvider, useAuthSheet } from "@/components/naada/auth-sheet";
import { BriefComposerProvider } from "@/components/naada/brief-composer";
import { ErrorBoundary } from "@/components/naada/error-boundary";
import { NearbyLoader } from "@/components/naada/nearby-loader";
import { RequireRole } from "@/components/naada/require-role";
import { RequireGate } from "@/components/naada/require-gate";
import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/naada/cookie-consent";
import { useConsent } from "@/lib/consent";
import { useStore } from "@/store/app-store";
import { getMe, tokens, AUTH_EXPIRED_EVENT } from "@/lib/api";
import { trackPageview } from "@/lib/analytics";
import { internalPath, prefetchPublicPagesWhenIdle, prefetchRoute } from "@/lib/prefetch";
import { PublicShell } from "@/components/naada/public-shell";

/*
 * The landing path loads eagerly: the home page, a gig, and the two checkout
 * steps. Those four are what a visitor who taps a poster link actually walks
 * through, and the checkout ones stay eager deliberately — a buyer committing
 * to a payment on a patchy connection should not also be waiting on a
 * JavaScript chunk to arrive.
 *
 * The browse pages are one deliberate click away and can fetch on demand; see
 * the lazy block below.
 */
import { HomeFeed } from "@/screens/home-feed";
import { RoleHomeScreen } from "@/screens/home/role-home";
import { EventScreen } from "@/screens/event";
import { CheckoutDetailsScreen } from "@/screens/checkout-details";
import { CheckoutPayScreen } from "@/screens/checkout-pay";
import { NotFoundScreen } from "@/screens/not-found";

/*
 * Console, admin and legal screens are split out. They were statically
 * imported, so a first-time visitor looking at one gig downloaded the entire
 * host console, artist console and admin tooling before the page could paint.
 */
/**
 * Named-export equivalent of React.lazy. The `any` is load-bearing: it is the
 * constraint that lets C be inferred as the real component type, so props
 * survive. Narrowing it erases them and every prop becomes a type error.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lazyScreen<K extends string, C extends React.ComponentType<any>>(
  loader: () => Promise<Record<K, C>>,
  key: K,
): React.LazyExoticComponent<C> {
  return lazy(async () => ({ default: (await loader())[key] }));
}

/* Public, but not on the landing path — a click away, and worth not making
 * every first-time visitor download before they have seen a single gig. */
const ArtistsScreen = lazyScreen(() => import("@/screens/artists"), "ArtistsScreen");
const ArtistProfileScreen = lazyScreen(() => import("@/screens/artist-profile"), "ArtistProfileScreen");
const ExploreScreen = lazyScreen(() => import("@/screens/explore"), "ExploreScreen");
const VenuesScreen = lazyScreen(() => import("@/screens/venues"), "VenuesScreen");
const VenueProfileScreen = lazyScreen(() => import("@/screens/venue-profile"), "VenueProfileScreen");
const HowItWorksScreen = lazyScreen(() => import("@/screens/how-it-works"), "HowItWorksScreen");
/* Post-purchase: nobody reaches these before they have bought something. */
const TicketDetailScreen = lazyScreen(() => import("@/screens/ticket-detail"), "TicketDetailScreen");
const MyTicketsScreen = lazyScreen(() => import("@/screens/my-tickets"), "MyTicketsScreen");

const HostHomeScreen = lazyScreen(() => import("@/screens/home/host-home-landing"), "HostHomeLandingScreen");
const HostVenueLayoutScreen = lazyScreen(() => import("@/screens/host/host-venue-layout"), "HostVenueLayoutScreen");
const HostEventsScreen = lazyScreen(() => import("@/screens/host/host-events"), "HostEventsScreen");
const HostEventManagerScreen = lazyScreen(() => import("@/screens/host/host-event-manager"), "HostEventManagerScreen");
const HostEventEditorScreen = lazyScreen(() => import("@/screens/host/host-event-editor"), "HostEventEditorScreen");
const HostArtistSearchScreen = lazyScreen(() => import("@/screens/host/host-artist-search"), "HostArtistSearchScreen");
const HostBookingsScreen = lazyScreen(() => import("@/screens/host/host-bookings"), "HostBookingsScreen");
const HostSettlementsScreen = lazyScreen(() => import("@/screens/host/host-settlements"), "HostSettlementsScreen");
const HostVenueBusinessScreen = lazyScreen(() => import("@/screens/host/host-venue-business"), "HostVenueBusinessScreen");
const HostGateTeamScreen = lazyScreen(() => import("@/screens/host/host-gate-team"), "HostGateTeamScreen");
const GateScreen = lazyScreen(() => import("@/screens/gate"), "GateScreen");
const HostDoorScannerScreen = lazyScreen(() => import("@/screens/host/host-door-scanner"), "HostDoorScannerScreen");

const ArtistHomeScreen = lazyScreen(() => import("@/screens/home/artist-home-landing"), "ArtistHomeLandingScreen");
const ArtistGigBoardScreen = lazyScreen(() => import("@/screens/artist/artist-gig-board"), "ArtistGigBoardScreen");
const ArtistOffersScreen = lazyScreen(() => import("@/screens/artist/artist-offers"), "ArtistOffersScreen");
const ArtistGigsScreen = lazyScreen(() => import("@/screens/artist/artist-gigs"), "ArtistGigsScreen");
const ArtistEarningsScreen = lazyScreen(() => import("@/screens/artist/artist-earnings"), "ArtistEarningsScreen");
const ArtistProfileBuilderScreen = lazyScreen(() => import("@/screens/artist/artist-profile-builder"), "ArtistProfileBuilderScreen");

const AdminHomeScreen = lazyScreen(() => import("@/screens/admin/admin-home"), "AdminHomeScreen");
const AdminVerificationScreen = lazyScreen(() => import("@/screens/admin/admin-verification"), "AdminVerificationScreen");
const AdminDisputesScreen = lazyScreen(() => import("@/screens/admin/admin-disputes"), "AdminDisputesScreen");
const AdminLedgerScreen = lazyScreen(() => import("@/screens/admin/admin-ledger"), "AdminLedgerScreen");
const AdminMessagesScreen = lazyScreen(() => import("@/screens/admin/admin-messages"), "AdminMessagesScreen");

const BookingThreadScreen = lazyScreen(() => import("@/screens/booking-thread"), "BookingThreadScreen");
const KeyboardLabScreen = lazyScreen(() => import("@/screens/keyboard-lab"), "KeyboardLabScreen");
const SettingsScreen = lazyScreen(() => import("@/screens/settings"), "SettingsScreen");
const LegalScreen = lazyScreen(() => import("@/screens/legal"), "LegalScreen");
const NotificationsScreen = lazyScreen(() => import("@/screens/notifications"), "NotificationsScreen");
const SavedScreen = lazyScreen(() => import("@/screens/saved"), "SavedScreen");

/** Each page eases in instead of appearing in a cut. */
function PageFade({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <motion.div key={pathname} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}

/** One pageview per route change (autocapture is off). A no-op without analytics consent. */
function PageviewTracker() {
  const { pathname } = useLocation();
  const consent = useConsent();
  useEffect(() => trackPageview(pathname), [pathname, consent?.analytics]);
  return null;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const ROLE_MAP: Record<string, import("@/data/fixtures").Role> = {
  listener: "listener",
  artist: "artist",
  venue_owner: "host",
  admin: "admin",
};

/** Loads public event/artist data on mount and restores session if a token exists. */
function AppBootstrap() {
  const { hydrateFromApi, setRole, setCurrentUser, setAuthReady } = useStore();

  useEffect(() => {
    hydrateFromApi().catch(() => {
      // Backend not running — fixtures stay in place, no error shown
    });

    if (tokens.access) {
      getMe()
        .then((user) => {
          setRole(ROLE_MAP[user.role] ?? "listener");
          setCurrentUser({
            id: user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
          });
          hydrateFromApi().catch(console.error);
        })
        .catch(() => {
          tokens.clear();
        })
        .finally(() => setAuthReady(true));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * A refresh that fails means the session is genuinely over. Prompt for sign-in
 * rather than leaving the user on a screen whose every request quietly fails.
 */
function SessionWatch() {
  const { open } = useAuthSheet();
  const { setRole, setCurrentUser, toast } = useStore();

  useEffect(() => {
    const onExpired = () => {
      setRole("out");
      setCurrentUser(null);
      toast("Your session ended — sign in to pick up where you left off", "fault");
      open("Sign in to continue");
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [open, setRole, setCurrentUser, toast]);

  return null;
}

/**
 * What shows while a page's code arrives. A public page keeps the site header
 * and shows the shape of a page under a thin travelling line, so a click never
 * turns into a blank screen. Console pages (which have their own shell) get the
 * line and a quiet mark.
 */
function ScreenFallback() {
  const { pathname } = useLocation();
  const inConsole = /^\/(host|artist|admin|gate)(\/|$)/.test(pathname);
  const bar = <div className="route-bar" aria-hidden="true" />;
  if (inConsole) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink" role="status" aria-label="Loading">
        {bar}
        <span className="font-megrim text-[28px] uppercase tracking-[0.06em] text-paper/70 route-pulse">showzy</span>
      </div>
    );
  }
  return (
    <PublicShell>
      {bar}
      <div className="px-[var(--page-pad)] pt-10" role="status" aria-label="Loading">
        <div className="route-pulse h-9 w-56 rounded bg-paper/10" />
        <div className="route-pulse mt-3 h-4 w-80 max-w-full rounded bg-paper/10" />
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="route-pulse aspect-[3/4] rounded-xl bg-paper/10" style={{ animationDelay: `${i * 90}ms` }} />
          ))}
        </div>
      </div>
    </PublicShell>
  );
}

/** Warm the next page's code on idle and as a pointer or finger heads for a link. */
function RoutePrefetcher() {
  useEffect(() => {
    const stopIdle = prefetchPublicPagesWhenIdle();
    const warm = (e: Event) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      const path = a ? internalPath(a) : null;
      if (path) prefetchRoute(path);
    };
    const events = ["pointerover", "focusin", "touchstart"] as const;
    events.forEach((n) => document.addEventListener(n, warm, { passive: true }));
    return () => {
      stopIdle();
      events.forEach((n) => document.removeEventListener(n, warm));
    };
  }, []);
  return null;
}

const host = (element: React.ReactNode) => (
  <RequireRole roles={["host"]} suggest="host">{element}</RequireRole>
);

const artist = (element: React.ReactNode) => (
  <RequireRole roles={["artist"]} suggest="artist">{element}</RequireRole>
);

const admin = (element: React.ReactNode) => (
  <RequireRole roles={["admin"]} suggest="admin">{element}</RequireRole>
);

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <AppStoreProvider>
            <AppBootstrap />
            <HostBranchProvider>
            <AuthSheetProvider>
              <SessionWatch />
              <BriefComposerProvider>
                <ScrollToTop />
                <RoutePrefetcher />
                <PageviewTracker />
                <Suspense fallback={<ScreenFallback />}>
                  <PageFade>
                  <Routes>
                    {/* Public */}
                    {/*
                     * `/` answers by role: signed out and listeners keep the
                     * discover page, artists and hosts get their own home.
                     * `/whats-on` is that same discover page on a stable URL,
                     * so a signed-in artist or host never loses access to it.
                     */}
                    <Route path="/" element={<RoleHomeScreen />} />
                    <Route path="/whats-on" element={<HomeFeed />} />
                    <Route path="/e/:id" element={<EventScreen />} />
                    <Route path="/a/:id" element={<ArtistProfileScreen />} />
                    <Route path="/artists" element={<ArtistsScreen />} />
                    <Route path="/explore" element={<ExploreScreen />} />
                    <Route path="/venues" element={<VenuesScreen />} />
                    <Route path="/v/:slug" element={<VenueProfileScreen />} />
                    <Route path="/how-it-works" element={<HowItWorksScreen />} />
                    <Route path="/checkout/details" element={<CheckoutDetailsScreen />} />
                    <Route path="/checkout/pay" element={<CheckoutPayScreen />} />
                    <Route path="/ticket/:code" element={<TicketDetailScreen />} />
                    <Route path="/tickets" element={<MyTicketsScreen />} />
                    <Route path="/settings" element={<SettingsScreen />} />
                    <Route path="/notifications" element={<NotificationsScreen />} />
                    <Route path="/saved" element={<SavedScreen />} />

                    {/* Legal — Razorpay merchant approval requires these to resolve */}
                    <Route path="/terms" element={<LegalScreen doc="terms" />} />
                    <Route path="/privacy" element={<LegalScreen doc="privacy" />} />
                    <Route path="/refunds" element={<LegalScreen doc="refunds" />} />
                    <Route path="/cookies" element={<LegalScreen doc="cookies" />} />
                    <Route path="/contact" element={<LegalScreen doc="contact" />} />

                    {/* Host console */}
                    <Route path="/host" element={host(<HostHomeScreen />)} />
                    <Route path="/host/venue" element={host(<HostVenueLayoutScreen />)} />
                    <Route path="/host/venue/layout" element={host(<HostVenueLayoutScreen />)} />
                    <Route path="/host/events" element={host(<HostEventsScreen />)} />
                    <Route path="/host/events/new" element={host(<HostEventEditorScreen />)} />
                    <Route path="/host/events/:id" element={host(<HostEventManagerScreen />)} />
                    <Route path="/host/events/:id/edit" element={host(<HostEventEditorScreen />)} />
                    <Route path="/host/events/:id/door" element={host(<HostDoorScannerScreen />)} />
                    <Route path="/host/events/:id/gate" element={host(<HostGateTeamScreen />)} />
                    {/* Gatekeepers are ordinary accounts, and the server decides what each may scan. These
                        pages exist only for people holding an invitation or a door; to everyone else
                        they are a plain 404 (see RequireGate). */}
                    <Route path="/gate" element={<RequireGate><GateScreen /></RequireGate>} />
                    <Route
                      path="/gate/:id/door"
                      element={<RequireGate door><HostDoorScannerScreen variant="gate" /></RequireGate>}
                    />
                    <Route path="/host/artists" element={host(<HostArtistSearchScreen />)} />
                    <Route path="/host/bookings" element={host(<HostBookingsScreen />)} />
                    <Route path="/host/settlements" element={host(<HostSettlementsScreen />)} />
                    <Route path="/host/business" element={host(<HostVenueBusinessScreen />)} />

                    {/* Artist console */}
                    <Route path="/artist" element={artist(<ArtistHomeScreen />)} />
                    <Route path="/artist/gig-board" element={artist(<ArtistGigBoardScreen />)} />
                    <Route path="/artist/offers" element={artist(<ArtistOffersScreen />)} />
                    <Route path="/artist/gigs" element={artist(<ArtistGigsScreen />)} />
                    <Route path="/artist/earnings" element={artist(<ArtistEarningsScreen />)} />
                    <Route path="/artist/profile" element={artist(<ArtistProfileBuilderScreen />)} />

                    {/* Admin / ops console */}
                    <Route path="/admin" element={admin(<AdminHomeScreen />)} />
                    <Route path="/admin/verification" element={admin(<AdminVerificationScreen />)} />
                    <Route path="/admin/disputes" element={admin(<AdminDisputesScreen />)} />
                    <Route path="/admin/ledger" element={admin(<AdminLedgerScreen />)} />
                    <Route path="/admin/messages" element={admin(<AdminMessagesScreen />)} />

                    {/* Shared by host, artist and admin (read-only) */}
                    <Route
                      path="/bookings/:id"
                      element={
                        <RequireRole roles={["host", "artist", "admin"]} suggest="host">
                          <BookingThreadScreen />
                        </RequireRole>
                      }
                    />

                    {/* Component lab — dev-only, never registered in a production build */}
                    {import.meta.env.DEV && (
                      <Route path="/lab/keyboard" element={<KeyboardLabScreen />} />
                    )}

                    <Route path="*" element={<NotFoundScreen />} />
                  </Routes>
                  </PageFade>
                </Suspense>

                <NearbyLoader />
                <CookieConsent />
                <Toaster />
              </BriefComposerProvider>
            </AuthSheetProvider>
            </HostBranchProvider>
          </AppStoreProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
