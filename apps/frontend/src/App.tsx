import { useEffect } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { MotionConfig } from "motion/react";

import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { BriefComposerProvider } from "@/components/naada/brief-composer";
import { DevSwitcher } from "@/components/naada/dev-switcher";
import { RequireRole } from "@/components/naada/require-role";
import { Toaster } from "@/components/ui/toaster";
import { useStore } from "@/store/app-store";
import { getMe } from "@/lib/api";
import { tokens } from "@/lib/api";

import { DiscoverScreen } from "@/screens/discover";
import { EventScreen } from "@/screens/event";
import { ArtistProfileScreen } from "@/screens/artist-profile";
import { CheckoutDetailsScreen } from "@/screens/checkout-details";
import { CheckoutPayScreen } from "@/screens/checkout-pay";
import { TicketDetailScreen } from "@/screens/ticket-detail";
import { MyTicketsScreen } from "@/screens/my-tickets";
import { BookingThreadScreen } from "@/screens/booking-thread";
import { NotFoundScreen } from "@/screens/not-found";
import { KeyboardLabScreen } from "@/screens/keyboard-lab";

import { HostHomeLetterpressScreen } from "@/screens/host/host-home-letterpress";
import { HostEventsScreen } from "@/screens/host/host-events";
import { HostEventManagerScreen } from "@/screens/host/host-event-manager";
import { HostEventEditorScreen } from "@/screens/host/host-event-editor";
import { HostArtistSearchScreen } from "@/screens/host/host-artist-search";
import { HostBookingsScreen } from "@/screens/host/host-bookings";
import { HostSettlementsScreen } from "@/screens/host/host-settlements";
import { HostDoorScannerScreen } from "@/screens/host/host-door-scanner";

import { ArtistHomeScreen } from "@/screens/artist/artist-home";
import { ArtistGigBoardScreen } from "@/screens/artist/artist-gig-board";
import { ArtistOffersScreen } from "@/screens/artist/artist-offers";
import { ArtistGigsScreen } from "@/screens/artist/artist-gigs";
import { ArtistEarningsScreen } from "@/screens/artist/artist-earnings";
import { ArtistProfileBuilderScreen } from "@/screens/artist/artist-profile-builder";

import { AdminHomeScreen } from "@/screens/admin/admin-home";
import { AdminVerificationScreen } from "@/screens/admin/admin-verification";
import { AdminDisputesScreen } from "@/screens/admin/admin-disputes";
import { AdminLedgerScreen } from "@/screens/admin/admin-ledger";
import { AdminMessagesScreen } from "@/screens/admin/admin-messages";

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

/** Loads public event/artist data on mount and restores session if token exists. */
function AppBootstrap() {
  const { hydrateFromApi, setRole } = useStore();

  useEffect(() => {
    // Always load public data (events, artists) for guest browsing
    hydrateFromApi().catch(() => {
      // Backend not running — fixtures stay in place, no error shown
    });

    // Restore session if token exists in localStorage
    if (tokens.access) {
      getMe()
        .then((user) => {
          const role = ROLE_MAP[user.role] ?? "listener";
          setRole(role);
          hydrateFromApi().catch(console.error);
        })
        .catch(() => {
          // Token expired — clear it silently
          tokens.clear();
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const host = (element: React.ReactNode) => (
  <RequireRole roles={["host"]} suggest="host">
    {element}
  </RequireRole>
);

const artist = (element: React.ReactNode) => (
  <RequireRole roles={["artist"]} suggest="artist">
    {element}
  </RequireRole>
);

const admin = (element: React.ReactNode) => (
  <RequireRole roles={["admin"]} suggest="admin">
    {element}
  </RequireRole>
);

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <AppStoreProvider>
          <AppBootstrap />
          <AuthSheetProvider>
            <BriefComposerProvider>
              <ScrollToTop />
              <Routes>
                {/* Public */}
                <Route path="/" element={<DiscoverScreen />} />
                <Route path="/e/:id" element={<EventScreen />} />
                <Route path="/a/:id" element={<ArtistProfileScreen />} />
                <Route path="/checkout/details" element={<CheckoutDetailsScreen />} />
                <Route path="/checkout/pay" element={<CheckoutPayScreen />} />
                <Route path="/ticket/:code" element={<TicketDetailScreen />} />
                <Route path="/tickets" element={<MyTicketsScreen />} />

                {/* Host console */}
                <Route path="/host" element={host(<HostHomeLetterpressScreen />)} />
                <Route path="/host/events" element={host(<HostEventsScreen />)} />
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

              <Toaster />
              <DevSwitcher />
            </BriefComposerProvider>
          </AuthSheetProvider>
        </AppStoreProvider>
      </BrowserRouter>
    </MotionConfig>
  );
}
