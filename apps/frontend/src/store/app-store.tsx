import { KANNADA_ENABLED } from "@/lib/features";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  users,
  MAX_COUNTERS,
  type ApplicationStatus,
  type Artist,
  type Booking,
  type DisputeOutcome,
  type EventStatus,
  type GigApplication,
  type KycStatus,
  type NaadaEvent,
  type Role,
  type Ticket,
  type Tier,
  type Venue,
} from "@/data/fixtures";
import { readPref, useConsent, writePref } from "@/lib/consent";

import * as api from "@/lib/api";
import type { ApiVenue } from "@/lib/api";
import {
  adaptEvent,
  adaptArtist,
  adaptVenue,
  adaptTicket,
  adaptOrder,
} from "@/lib/adapters";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Theme = "dark" | "light";
export type Lang = "en" | "kn";

export interface Toast {
  id: number;
  message: string;
  tone: "default" | "success" | "fault";
}

export interface CheckoutDraft {
  eventId: string | null;
  tierName: string | null;
  /** Server tier id. Null when the event came from fixtures, which cannot be ordered. */
  tierId: string | null;
  qty: number;
  guest: { name: string; phone: string; email: string };
  isGuest: boolean;
}

export interface ArtistProfileDraft {
  name: string;
  genres: string[];
  city: string;
  bio: string;
  feeMin: number;
  feeMax: number;
  photo: boolean;
  clips: number;
}

const EMPTY_CHECKOUT: CheckoutDraft = {
  eventId: null,
  tierName: null,
  tierId: null,
  qty: 1,
  guest: { name: "", phone: "", email: "" },
  isGuest: false,
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

export interface CurrentUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

interface AppStore {
  role: Role;
  setRole: (role: Role) => void;

  currentUser: CurrentUser | null;
  setCurrentUser: (user: CurrentUser | null) => void;
  /**
   * False only while a saved session is being restored on page load. Until it
   * is true, "signed out" may just mean "not asked yet" — so guarded pages wait
   * instead of flashing a sign-in prompt or a 404 at someone who is signed in.
   */
  authReady: boolean;
  setAuthReady: (ready: boolean) => void;

  theme: Theme;
  setTheme: (theme: Theme) => void;
  lang: Lang;
  setLang: (lang: Lang) => void;

  /** Fetch real data from API and replace in-memory fixtures. */
  hydrateFromApi: () => Promise<void>;
  /** True once the events request has succeeded (even with an empty list). False while loading or failing. */
  eventsLoaded: boolean;

  events: NaadaEvent[];
  artists: Artist[];
  bookings: Booking[];
  tickets: Ticket[];
  applications: GigApplication[];
  venues: Venue[];
  users: typeof users;

  checkout: CheckoutDraft;
  artistProfile: ArtistProfileDraft;
  emptyLists: boolean;

  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;

  /* selectors */
  eventById: (id: string) => NaadaEvent | undefined;
  artistById: (id: string) => Artist | undefined;
  venueById: (id: string) => Venue | undefined;
  bookingById: (id: string) => Booking | undefined;
  ticketByCode: (code: string) => Ticket | undefined;
  venueOf: (event: NaadaEvent) => Venue | undefined;
  soldOf: (event: NaadaEvent) => number;
  capacityOf: (event: NaadaEvent) => number;

  /* actions */
  startCheckout: (eventId: string, tierName: string, tierId?: string, qty?: number) => void;
  setGuestDetails: (guest: CheckoutDraft["guest"], isGuest: boolean) => void;
  clearCheckout: () => void;

  checkIn: (eventId: string, code: string) => "ok" | "duplicate" | "invalid";
  setEmptyLists: (value: boolean) => void;

  updateEvent: (id: string, patch: Partial<NaadaEvent>) => void;
  setEventStatus: (id: string, status: EventStatus) => void;
  addTier: (id: string, tier: Tier) => void;
  removeTier: (id: string, tierName: string) => void;

  updateArtistProfile: (patch: Partial<ArtistProfileDraft>) => void;

  applyToGig: (
    eventId: string,
    artistId: string,
    message: string,
    proposedRate?: number,
  ) => GigApplication;
  setApplicationStatus: (id: string, status: ApplicationStatus) => void;

  setArtistKycStatus: (artistId: string, status: KycStatus) => void;
  resolveDispute: (bookingId: string, outcome: DisputeOutcome, note: string) => void;


  /* API-backed booking actions */
  apiFundOrder: (orderId: string) => Promise<void>;
  apiCompleteOrder: (orderId: string) => Promise<void>;
}

const StoreContext = createContext<AppStore | null>(null);

let toastSeq = 0;

/** Test-only hook for seeding the store; production always starts empty. */
export interface StoreSeed {
  events?: NaadaEvent[];
  artists?: Artist[];
  venues?: Venue[];
  bookings?: Booking[];
  tickets?: Ticket[];
  applications?: GigApplication[];
}

const EMPTY_SEED: Required<StoreSeed> = {
  events: [], artists: [], venues: [], bookings: [], tickets: [],
  applications: [],
};

export function AppStoreProvider({
  children,
  seed: seedProp,
}: {
  children: ReactNode;
  seed?: StoreSeed;
}) {
  const seed = { ...EMPTY_SEED, ...seedProp };
  const [role, setRole] = useState<Role>("out");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authReady, setAuthReady] = useState(() => !api.tokens.access);
  /*
   * Theme and language are read back from the browser so a choice survives a
   * reload. Both were in-memory only, so every refresh silently reset to dark
   * English.
   */
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      // Light unless the visitor has chosen dark.
      return readPref("naada_theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return KANNADA_ENABLED && readPref("naada_lang") === "kn" ? "kn" : "en";
    } catch {
      return "en";
    }
  });

  /*
   * One place decides what the page looks like.
   *
   * This class used to be set inside the discover screen's own effect, so it
   * only tracked the theme while that screen was mounted — navigate to a
   * ticket or a policy page and you kept whatever class happened to be left
   * over. That is why switching theme appeared to work on the home page and
   * nowhere else.
   */
  // Re-run when the cookie choice changes so saying yes remembers the current
  // theme/language immediately, and saying no forgets what was remembered.
  const consent = useConsent();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("theme-light", theme === "light");
    root.style.colorScheme = theme;
    // Persists only if the visitor said yes to "preferences" (see lib/consent).
    writePref("naada_theme", theme);
  }, [theme, consent]);

  useEffect(() => {
    document.documentElement.lang = lang === "kn" ? "kn" : "en";
    writePref("naada_lang", lang);
  }, [lang, consent]);
  /*
   * Every list starts empty and is filled from the API.
   *
   * These used to be seeded from the fixture file, which meant a slow or
   * failed API showed invented events, artists and tickets that looked
   * completely real — a made-up gig with a made-up venue, indistinguishable
   * from a listing someone could buy. An empty list and an honest empty state
   * is the only truthful thing to show when we have no data.
   *
   * The fixtures remain for tests, which seed the store deliberately.
   */
  const [events, setEvents] = useState<NaadaEvent[]>(seed.events);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [artists, setArtists] = useState<Artist[]>(seed.artists);
  const [venues, setVenues] = useState<Venue[]>(seed.venues);
  const [bookings, setBookings] = useState<Booking[]>(seed.bookings);
  const [tickets, setTickets] = useState<Ticket[]>(seed.tickets);
  const [applications, setApplications] = useState<GigApplication[]>(seed.applications);
  const [checkout, setCheckout] = useState<CheckoutDraft>(EMPTY_CHECKOUT);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [emptyLists, setEmptyLists] = useState(false);
  /*
   * Blank, not a fixture artist's details. This draft was pre-filled with a
   * made-up performer, so a real musician opening their profile builder saw
   * someone else's name, city and fee range already typed in.
   */
  const [artistProfile, setArtistProfile] = useState<ArtistProfileDraft>({
    name: "",
    genres: [],
    city: "",
    bio: "",
    feeMin: 0,
    feeMax: 0,
    photo: false,
    clips: 0,
  });

  /* ---- hydrate from API ---- */
  const hydrateFromApi = useCallback(async () => {
    try {
      // Walk every page. These used the single-page endpoints, which capped
      // the entire catalogue at 20 events and 20 artists.
      const [eventsData, artistsData, venuesData] = await Promise.allSettled([
        api.getAllEvents().then((results) => ({ results })),
        api.getAllArtists().then((results) => ({ results })),
        api.getAllVenues().then((results) => ({ results })),
      ]);

      if (eventsData.status === "fulfilled") {
        const adapted = eventsData.value.results.map(adaptEvent);
        setEvents(adapted);
        setEventsLoaded(true);
        // Build venues from flat event fields (list endpoint returns venue as UUID + venue_name/venue_area)
        const eventVenues = eventsData.value.results.map((e) => {
          const raw = e as unknown as { venue: string | ApiVenue; venue_name?: string; venue_area?: string };
          if (typeof raw.venue === "object" && raw.venue) return adaptVenue(raw.venue as ApiVenue);
          return {
            id: raw.venue as string,
            name: raw.venue_name ?? "",
            area: raw.venue_area ?? "",
            capacity: 0,
          } as Venue;
        });
        setVenues((prev) => {
          const ids = new Set(prev.map((v) => v.id));
          const merged = [...prev];
          for (const v of eventVenues) {
            if (!ids.has(v.id)) {
              merged.push(v);
              ids.add(v.id);
            }
          }
          return merged;
        });
      }

      if (artistsData.status === "fulfilled") {
        setArtists(artistsData.value.results.map(adaptArtist));
      }

      if (venuesData.status === "fulfilled") {
        setVenues(venuesData.value.results.map(adaptVenue));
      }

      // Fetch user-specific data only when authenticated
      if (!api.tokens.access) return;
      const [ticketsData, ordersData] = await Promise.allSettled([
        api.getMyTickets(),
        api.getMyOrders(),
      ]);

      if (ticketsData.status === "fulfilled") {
        const rows = ticketsData.value.results;
        setTickets(rows.map(adaptTicket));

        // A ticket may be for an event no longer in the public list — a past
        // gig, or one since unpublished. The ticket carries enough flat detail
        // to render "My tickets" without a second round trip per event.
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const merged = [...prev];
          for (const t of rows) {
            if (ids.has(t.event)) continue;
            merged.push({
              id: t.event,
              name: t.event_title,
              venueId: "",
              date: (t.event_date ?? "").slice(0, 10),
              doors: "",
              status: "completed",
              genres: [],
              lineup: [],
              tiers: [],
            } as unknown as NaadaEvent);
            ids.add(t.event);
          }
          return merged;
        });
      }

      if (ordersData.status === "fulfilled") {
        const adapted = ordersData.value.results.map((o) => adaptOrder(o));
        setBookings(adapted);
      }
    } catch (err) {
      console.error("hydrateFromApi failed:", err);
    }
  }, []);

  /* ---- toasts ---- */
  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Toast["tone"] = "default") => {
      const id = ++toastSeq;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast],
  );

  /* ---- selectors ---- */
  const eventById = useCallback((id: string) => events.find((e) => e.id === id), [events]);
  const artistById = useCallback((id: string) => artists.find((a) => a.id === id), [artists]);
  const venueById = useCallback((id: string) => venues.find((v) => v.id === id), [venues]);
  const bookingById = useCallback((id: string) => bookings.find((b) => b.id === id), [bookings]);
  const ticketByCode = useCallback(
    (code: string) => tickets.find((t) => t.code === code),
    [tickets],
  );
  const venueOf = useCallback(
    (event: NaadaEvent) => venues.find((v) => v.id === event.venueId),
    [venues],
  );
  const soldOf = useCallback(
    (event: NaadaEvent) => event.tiers.reduce((sum, t) => sum + t.sold, 0),
    [],
  );
  const capacityOf = useCallback(
    (event: NaadaEvent) => event.tiers.reduce((sum, t) => sum + t.capacity, 0),
    [],
  );

  /* ---- checkout ---- */
  const startCheckout = useCallback(
    (eventId: string, tierName: string, tierId?: string, qty = 1) => {
      setCheckout({ ...EMPTY_CHECKOUT, eventId, tierName, tierId: tierId ?? null, qty });
    },
    [],
  );

  const setGuestDetails = useCallback(
    (guest: CheckoutDraft["guest"], isGuest: boolean) =>
      setCheckout((prev) => ({ ...prev, guest, isGuest })),
    [],
  );

  const clearCheckout = useCallback(() => setCheckout(EMPTY_CHECKOUT), []);

  const checkIn = useCallback(
    (eventId: string, code: string): "ok" | "duplicate" | "invalid" => {
      const ticket = tickets.find((t) => t.code === code && t.eventId === eventId);
      if (!ticket || ticket.status === "cancelled") return "invalid";
      if (ticket.status === "checked_in") return "duplicate";
      setTickets((prev) =>
        prev.map((t) =>
          t.code === code ? { ...t, status: "checked_in" as const, checkedInAt: "now" } : t,
        ),
      );
      setEvents((prev) =>
        prev.map((e) => (e.id === eventId ? { ...e, checkedIn: e.checkedIn + 1 } : e)),
      );
      return "ok";
    },
    [tickets],
  );

  /* ---- events ---- */
  const updateEvent = useCallback((id: string, patch: Partial<NaadaEvent>) => {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const setEventStatus = useCallback(
    (id: string, status: EventStatus) => updateEvent(id, { status }),
    [updateEvent],
  );

  const addTier = useCallback((id: string, tier: Tier) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, tiers: [...e.tiers, tier] } : e)),
    );
  }, []);

  const removeTier = useCallback((id: string, tierName: string) => {
    setEvents((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, tiers: e.tiers.filter((t) => t.name !== tierName) } : e,
      ),
    );
  }, []);

  /* ---- bookings ---- */
  const now = () => new Date().toISOString().slice(0, 19);

  const updateArtistProfile = useCallback(
    (patch: Partial<ArtistProfileDraft>) => setArtistProfile((prev) => ({ ...prev, ...patch })),
    [],
  );

  /* ---- API-backed fund order ---- */
  const apiFundOrder = useCallback(async (orderId: string): Promise<void> => {
    // Dev mode: use placeholder Razorpay data
    await api.fundOrder(orderId, {
      razorpay_order_id: `order_DEV_${Date.now()}`,
      razorpay_payment_id: `pay_DEV_${Date.now()}`,
      razorpay_signature: "dev_sig_bypass",
    });
    setBookings((prev) =>
      prev.map((b) => (b.id === orderId ? { ...b, state: "funded" } : b)),
    );
  }, []);

  /* ---- API-backed complete order ---- */
  const apiCompleteOrder = useCallback(async (orderId: string): Promise<void> => {
    await api.completeOrder(orderId);
    setBookings((prev) =>
      prev.map((b) => (b.id === orderId ? { ...b, state: "released" } : b)),
    );
  }, []);

  /* ---- admin / ops ---- */
  const setArtistKycStatus = useCallback((artistId: string, status: KycStatus) => {
    setArtists((prev) => prev.map((a) => (a.id === artistId ? { ...a, kycStatus: status } : a)));
  }, []);

  const resolveDispute = useCallback(
    (bookingId: string, outcome: DisputeOutcome, note: string) => {
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id !== bookingId) return b;
          return {
            ...b,
            state: outcome === "release" ? "released" : "cancelled",
            resolution: { outcome, note, by: users.admin.name, at: now() },
          };
        }),
      );
    },
    [],
  );

  /* ---- gig board ---- */
  const applyToGig = useCallback(
    (eventId: string, artistId: string, message: string, proposedRate?: number): GigApplication => {
      const created: GigApplication = {
        id: `ga${Date.now()}`,
        eventId,
        artistId,
        message,
        proposedRate,
        status: "pending",
        createdAt: now(),
      };
      setApplications((prev) => [created, ...prev]);
      /*
       * Local record only. This used to fire its own API call as well as the
       * screen's, so every application was posted twice — and with the wrong
       * field names, so both failed silently. The screen owns the request,
       * because it is the only one that can report failure to the person.
       */
      return created;
    },
    [],
  );

  const setApplicationStatus = useCallback((id: string, status: ApplicationStatus) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  const value = useMemo<AppStore>(
    () => ({
      role,
      setRole,
      currentUser,
      setCurrentUser,
      authReady,
      setAuthReady,
      theme,
      setTheme,
      lang,
      setLang,
      hydrateFromApi,
      eventsLoaded,
      events,
      artists,
      bookings,
      tickets,
      applications,
      venues,
      users,
      checkout,
      artistProfile,
      emptyLists,
      toasts,
      toast,
      dismissToast,
      eventById,
      artistById,
      venueById,
      bookingById,
      ticketByCode,
      venueOf,
      soldOf,
      capacityOf,
      startCheckout,
      setGuestDetails,
      clearCheckout,

      checkIn,
      setEmptyLists,
      updateEvent,
      setEventStatus,
      addTier,
      removeTier,
      updateArtistProfile,
      setArtistKycStatus,
      resolveDispute,
      applyToGig,
      setApplicationStatus,
      apiFundOrder,
      apiCompleteOrder,
    }),
    [
      role, currentUser, authReady, theme, lang, hydrateFromApi, eventsLoaded,
      events, artists, bookings, tickets, applications, venues,
      checkout, artistProfile, emptyLists, toasts, toast, dismissToast,
      eventById, artistById, venueById, bookingById, ticketByCode,
      venueOf, soldOf, capacityOf, startCheckout, setGuestDetails, clearCheckout,
      checkIn, updateEvent, setEventStatus, addTier, removeTier,
      updateArtistProfile, setArtistKycStatus,
      resolveDispute, applyToGig, setApplicationStatus,
      apiFundOrder, apiCompleteOrder,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): AppStore {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <AppStoreProvider>");
  return ctx;
}

export { MAX_COUNTERS };
