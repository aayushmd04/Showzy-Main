import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";

import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider, useAuthSheet } from "@/components/naada/auth-sheet";
import { BriefComposerProvider } from "@/components/naada/brief-composer";
import { ErrorBoundary } from "@/components/naada/error-boundary";
import { RequireRole } from "@/components/naada/require-role";
import { Toaster } from "@/components/ui/toaster";
import { useStore } from "@/store/app-store";
import { getMe, tokens, AUTH_EXPIRED_EVENT } from "@/lib/api";

// Public screens load eagerly — they are the first thing every visitor sees.
import { DiscoverScreen } from "@/screens/discover";
import { RoleHomeScreen } from "@/screens/home/role-home";
import { EventScreen } from "@/screens/event";
import { ArtistProfileScreen } from "@/screens/artist-profile";
import { ArtistsScreen } from "@/screens/artists";
import { VenuesScreen } from "@/screens/venues";
import { HowItWorksScreen } from "@/screens/how-it-works";
import { CheckoutDetailsScreen } from "@/screens/checkout-details";
import { CheckoutPayScreen } from "@/screens/checkout-pay";
import { TicketDetailScreen } from "@/screens/ticket-detail";
import { MyTicketsScreen } from "@/screens/my-tickets";
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

const HostHomeLetterpressScreen = lazyScreen(() => import("@/screens/host/host-home-letterpress"), "HostHomeLetterpressScreen");
const HostVenueLayoutScreen = lazyScreen(() => import("@/screens/host/host-venue-layout"), "HostVenueLayoutScreen");
const HostEventsScreen = lazyScreen(() => import("@/screens/host/host-events"), "HostEventsScreen");
const HostEventManagerScreen = lazyScreen(() => import("@/screens/host/host-event-manager"), "HostEventManagerScreen");
const HostEventEditorScreen = lazyScreen(() => import("@/screens/host/host-event-editor"), "HostEventEditorScreen");
const HostArtistSearchScreen = lazyScreen(() => import("@/screens/host/host-artist-search"), "HostArtistSearchScreen");
const HostBookingsScreen = lazyScreen(() => import("@/screens/host/host-bookings"), "HostBookingsScreen");
const HostSettlementsScreen = lazyScreen(() => import("@/screens/host/host-settlements"), "HostSettlementsScreen");
const HostDoorScannerScreen = lazyScreen(() => import("@/screens/host/host-door-scanner"), "HostDoorScannerScreen");

const ArtistHomeScreen = lazyScreen(() => import("@/screens/artist/artist-home"), "ArtistHomeScreen");
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
  const { hydrateFromApi, setRole, setCurrentUser } = useStore();

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
        });
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

function ScreenFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink">
      <p className="t-micro text-muted" role="status">
        Loading…
      </p>
    </div>
  );
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
            <AuthSheetProvider>
              <SessionWatch />
              <BriefComposerProvider>
                <ScrollToTop />
                <Suspense fallback={<ScreenFallback />}>
                  <Routes>
                    {/* Public */}
                    {/*
                     * `/` answers by role: signed out and listeners keep the
                     * discover page, artists and hosts get their own home.
                     * `/whats-on` is that same discover page on a stable URL,
                     * so a signed-in artist or host never loses access to it.
                     */}
                    <Route path="/" element={<RoleHomeScreen />} />
                    <Route path="/whats-on" element={<DiscoverScreen />} />
                    <Route path="/e/:id" element={<EventScreen />} />
                    <Route path="/a/:id" element={<ArtistProfileScreen />} />
                    <Route path="/artists" element={<ArtistsScreen />} />
                    <Route path="/venues" element={<VenuesScreen />} />
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
                    <Route path="/contact" element={<LegalScreen doc="contact" />} />

                    {/* Host console */}
                    <Route path="/host" element={host(<HostHomeLetterpressScreen />)} />
                    <Route path="/host/venue" element={host(<HostVenueLayoutScreen />)} />
                    <Route path="/host/venue/layout" element={host(<HostVenueLayoutScreen />)} />
                    <Route path="/host/events" element={host(<HostEventsScreen />)} />
                    <Route path="/host/events/new" element={host(<HostEventEditorScreen />)} />
                    <Route path="/host/events/:id" element={host(<HostEventManagerScreen />)} />
                    <Route path="/host/events/:id/edit" element={host(<HostEventEditorScreen />)} />
                    <Route path="/host/events/:id/door" element={host(<HostDoorScannerScreen />)} />
                    <Route path="/host/artists" element={host(<HostArtistSearchScreen />)} />
                    <Route path="/host/bookings" element={host(<HostBookingsScreen />)} />
                    <Route path="/host/settlements" element={host(<HostSettlementsScreen />)} />

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

                    {/* Component lab */}
                    <Route path="/lab/keyboard" element={<KeyboardLabScreen />} />

                    <Route path="*" element={<NotFoundScreen />} />
                  </Routes>
                </Suspense>

                <Toaster />
              </BriefComposerProvider>
            </AuthSheetProvider>
          </AppStoreProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
