import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  artists as artistsFixture,
  bookings as bookingsFixture,
  events as eventsFixture,
  gigApplications as gigApplicationsFixture,
  messages as messagesFixture,
  reviews as reviewsFixture,
  settlements as settlementsFixture,
  tickets as ticketsFixture,
  users,
  venues,
  MAX_COUNTERS,
  type ApplicationStatus,
  type Artist,
  type Booking,
  type BookingState,
  type ChatMessage,
  type DisputeOutcome,
  type EventStatus,
  type GigApplication,
  type KycStatus,
  type NaadaEvent,
  type Quote,
  type Review,
  type Role,
  type Settlement,
  type SettlementStatus,
  type Ticket,
  type Tier,
} from "@/data/fixtures";
import { detectContactInfo } from "@/lib/contact-filter";
import { ticketCode } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface Toast {
  id: number;
  message: string;
  tone: "default" | "success" | "fault";
}

export interface CheckoutDraft {
  eventId: string | null;
  tierName: string | null;
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
  qty: 1,
  guest: { name: "", phone: "", email: "" },
  isGuest: false,
};

/* ------------------------------------------------------------------ */
/* Context                                                             */
/* ------------------------------------------------------------------ */

interface AppStore {
  role: Role;
  setRole: (role: Role) => void;

  events: NaadaEvent[];
  artists: Artist[];
  bookings: Booking[];
  tickets: Ticket[];
  settlements: Settlement[];
  messages: ChatMessage[];
  applications: GigApplication[];
  reviews: Review[];
  venues: typeof venues;
  users: typeof users;

  checkout: CheckoutDraft;
  artistProfile: ArtistProfileDraft;
  bankAdded: boolean;
  emptyLists: boolean;

  toasts: Toast[];
  toast: (message: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;

  /* selectors */
  eventById: (id: string) => NaadaEvent | undefined;
  artistById: (id: string) => Artist | undefined;
  venueById: (id: string) => (typeof venues)[number] | undefined;
  bookingById: (id: string) => Booking | undefined;
  ticketByCode: (code: string) => Ticket | undefined;
  messagesFor: (bookingId: string) => ChatMessage[];
  reviewsFor: (bookingId: string) => Review[];
  venueOf: (event: NaadaEvent) => (typeof venues)[number] | undefined;
  soldOf: (event: NaadaEvent) => number;
  capacityOf: (event: NaadaEvent) => number;

  /* actions */
  startCheckout: (eventId: string, tierName: string) => void;
  setGuestDetails: (guest: CheckoutDraft["guest"], isGuest: boolean) => void;
  clearCheckout: () => void;
  completePurchase: () => Ticket;
  cancelTicket: (code: string) => void;
  checkIn: (eventId: string, code: string) => "ok" | "duplicate" | "invalid";
  setEmptyLists: (value: boolean) => void;

  updateEvent: (id: string, patch: Partial<NaadaEvent>) => void;
  setEventStatus: (id: string, status: EventStatus) => void;
  addTier: (id: string, tier: Tier) => void;
  removeTier: (id: string, tierName: string) => void;

  sendBrief: (input: {
    eventId: string;
    artistId: string;
    amount: number;
    message: string;
  }) => Booking;
  counterBooking: (id: string, by: "host" | "artist", amount: number) => void;
  acceptBooking: (id: string, by: "host" | "artist") => void;
  declineBooking: (id: string) => void;
  fundBooking: (id: string) => void;
  setBookingState: (id: string, state: BookingState) => void;

  setSettlementStatus: (eventId: string, status: SettlementStatus) => void;
  updateArtistProfile: (patch: Partial<ArtistProfileDraft>) => void;
  setBankAdded: (value: boolean) => void;
  countersUsed: (booking: Booking) => number;

  /* chat — Section 12, disintermediation guard runs on every send */
  sendMessage: (bookingId: string, sender: "host" | "artist", body: string) => ChatMessage;

  /* gig board — artist-initiated applications to an open event slot */
  applyToGig: (
    eventId: string,
    artistId: string,
    message: string,
    proposedRate?: number,
  ) => GigApplication;
  setApplicationStatus: (id: string, status: ApplicationStatus) => void;

  /* admin / ops — mind map §14 */
  setArtistKycStatus: (artistId: string, status: KycStatus) => void;
  resolveDispute: (bookingId: string, outcome: DisputeOutcome, note: string) => void;
  reviewFlaggedMessage: (messageId: string) => void;

  /* reviews — the trust layer that makes booking a stranger viable */
  submitReview: (
    bookingId: string,
    direction: Review["direction"],
    rating: number,
    body: string,
  ) => Review;
}

const StoreContext = createContext<AppStore | null>(null);

/* ------------------------------------------------------------------ */
/* Provider                                                            */
/* ------------------------------------------------------------------ */

let toastSeq = 0;

// An artist can't hold two gigs on the same date (Q4 in the technical
// discovery — in production this is a partial unique DB index; here it's
// the same rule checked against in-memory state before the transition).
const HELD_STATES: BookingState[] = ["accepted", "funded", "performed", "released"];

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("out");
  const [events, setEvents] = useState<NaadaEvent[]>(() =>
    eventsFixture.map((e) => ({ ...e, tiers: e.tiers.map((t) => ({ ...t })) })),
  );
  const [artists, setArtists] = useState<Artist[]>(() => artistsFixture.map((a) => ({ ...a })));
  const [bookings, setBookings] = useState<Booking[]>(() =>
    bookingsFixture.map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q })) })),
  );
  const [tickets, setTickets] = useState<Ticket[]>(() => ticketsFixture.map((t) => ({ ...t })));
  const [settlements, setSettlements] = useState<Settlement[]>(() =>
    settlementsFixture.map((s) => ({ ...s })),
  );
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    messagesFixture.map((m) => ({ ...m })),
  );
  const [applications, setApplications] = useState<GigApplication[]>(() =>
    gigApplicationsFixture.map((a) => ({ ...a })),
  );
  const [reviews, setReviews] = useState<Review[]>(() => reviewsFixture.map((r) => ({ ...r })));
  const [checkout, setCheckout] = useState<CheckoutDraft>(EMPTY_CHECKOUT);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [bankAdded, setBankAdded] = useState(false);
  const [emptyLists, setEmptyLists] = useState(false);
  const [artistProfile, setArtistProfile] = useState<ArtistProfileDraft>(() => {
    const rohan = artistsFixture[0];
    return {
      name: rohan.name,
      genres: [...rohan.genres],
      city: rohan.city,
      bio: rohan.bio,
      feeMin: rohan.feeMin,
      feeMax: rohan.feeMax,
      photo: false,
      clips: 1,
    };
  });

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
  const venueById = useCallback((id: string) => venues.find((v) => v.id === id), []);
  const bookingById = useCallback((id: string) => bookings.find((b) => b.id === id), [bookings]);
  const ticketByCode = useCallback(
    (code: string) => tickets.find((t) => t.code === code),
    [tickets],
  );
  const messagesFor = useCallback(
    (bookingId: string) =>
      messages.filter((m) => m.bookingId === bookingId).sort((a, b) => a.at.localeCompare(b.at)),
    [messages],
  );
  const reviewsFor = useCallback(
    (bookingId: string) => reviews.filter((r) => r.bookingId === bookingId),
    [reviews],
  );
  const venueOf = useCallback((event: NaadaEvent) => venues.find((v) => v.id === event.venueId), []);
  const soldOf = useCallback(
    (event: NaadaEvent) => event.tiers.reduce((sum, t) => sum + t.sold, 0),
    [],
  );
  const capacityOf = useCallback(
    (event: NaadaEvent) => event.tiers.reduce((sum, t) => sum + t.capacity, 0),
    [],
  );

  /* ---- checkout ---- */
  const startCheckout = useCallback((eventId: string, tierName: string) => {
    setCheckout({ ...EMPTY_CHECKOUT, eventId, tierName });
  }, []);

  const setGuestDetails = useCallback(
    (guest: CheckoutDraft["guest"], isGuest: boolean) =>
      setCheckout((prev) => ({ ...prev, guest, isGuest })),
    [],
  );

  const clearCheckout = useCallback(() => setCheckout(EMPTY_CHECKOUT), []);

  const completePurchase = useCallback((): Ticket => {
    const event = events.find((e) => e.id === checkout.eventId);
    const tier = event?.tiers.find((t) => t.name === checkout.tierName);
    const holder = checkout.guest.name.trim() || users.listener.name;
    const created: Ticket = {
      id: `t${Date.now()}`,
      code: ticketCode(),
      eventId: event?.id ?? "e2",
      tier: tier?.name ?? "General",
      price: tier?.price ?? 0,
      fee: (tier?.price ?? 0) > 0 ? 19 : 0,
      holder,
      status: "valid",
    };
    setTickets((prev) => [created, ...prev]);
    setEvents((prev) =>
      prev.map((e) =>
        e.id === created.eventId
          ? {
              ...e,
              tiers: e.tiers.map((t) =>
                t.name === created.tier ? { ...t, sold: Math.min(t.sold + 1, t.capacity) } : t,
              ),
            }
          : e,
      ),
    );
    return created;
  }, [checkout, events]);

  const cancelTicket = useCallback((code: string) => {
    setTickets((prev) =>
      prev.map((t) => (t.code === code ? { ...t, status: "cancelled" as const } : t)),
    );
  }, []);

  const checkIn = useCallback(
    (eventId: string, code: string): "ok" | "duplicate" | "invalid" => {
      const ticket = tickets.find((t) => t.code === code && t.eventId === eventId);
      if (!ticket || ticket.status === "cancelled") return "invalid";
      if (ticket.status === "checked_in") return "duplicate";
      setTickets((prev) =>
        prev.map((t) =>
          t.code === code ? { ...t, status: "checked_in" as const, checkedInAt: "20:14" } : t,
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

  const countersUsed = useCallback((booking: Booking) => booking.quotes.length, []);

  const sendBrief = useCallback(
    (input: { eventId: string; artistId: string; amount: number; message: string }) => {
      const created: Booking = {
        id: `b${Date.now()}`,
        eventId: input.eventId,
        artistId: input.artistId,
        hostId: "h1",
        state: "requested",
        agreedFee: null,
        message: input.message,
        quotes: [{ by: "host", amount: input.amount, at: now() }],
      };
      setBookings((prev) => [created, ...prev]);
      setEvents((prev) =>
        prev.map((e) =>
          e.id === input.eventId && !e.lineup.includes(input.artistId)
            ? { ...e, lineup: [...e.lineup, input.artistId] }
            : e,
        ),
      );
      // A brief sent for an event/artist pair that has a live gig-board
      // application resolves that application — the negotiation now lives
      // in the booking thread, not the application.
      setApplications((prev) =>
        prev.map((a) =>
          a.eventId === input.eventId &&
          a.artistId === input.artistId &&
          (a.status === "pending" || a.status === "shortlisted")
            ? { ...a, status: "converted" }
            : a,
        ),
      );
      return created;
    },
    [],
  );

  const counterBooking = useCallback(
    (id: string, by: "host" | "artist", amount: number) => {
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const quote: Quote = { by, amount, at: now() };
          return { ...b, state: "negotiating", quotes: [...b.quotes, quote] };
        }),
      );
    },
    [],
  );

  const acceptBooking = useCallback(
    (id: string, by: "host" | "artist") => {
      const target = bookings.find((b) => b.id === id);
      const targetEvent = target && events.find((e) => e.id === target.eventId);
      if (target && targetEvent) {
        const conflict = bookings.some((b) => {
          if (b.id === target.id || b.artistId !== target.artistId) return false;
          if (!HELD_STATES.includes(b.state)) return false;
          return events.find((e) => e.id === b.eventId)?.date === targetEvent.date;
        });
        if (conflict) {
          const name = artists.find((a) => a.id === target.artistId)?.name ?? "This artist";
          toast(`${name} already has a gig that date`, "fault");
          return;
        }
      }
      setBookings((prev) =>
        prev.map((b) => {
          if (b.id !== id) return b;
          const last = b.quotes[b.quotes.length - 1];
          const amount = last?.amount ?? 0;
          return {
            ...b,
            state: "accepted",
            agreedFee: amount,
            quotes: [...b.quotes, { by, amount, at: now(), accepted: true }],
          };
        }),
      );
    },
    [bookings, events, artists, toast],
  );

  const declineBooking = useCallback((id: string) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, state: "declined" } : b)));
  }, []);

  const fundBooking = useCallback((id: string) => {
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, state: "funded" } : b)));
  }, []);

  const setBookingState = useCallback((id: string, state: BookingState) => {
    setBookings((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const last = b.quotes[b.quotes.length - 1];
        const settled: BookingState[] = ["accepted", "funded", "performed", "released"];
        const agreedFee = settled.includes(state) ? (b.agreedFee ?? last?.amount ?? 0) : b.agreedFee;
        return { ...b, state, agreedFee };
      }),
    );
  }, []);

  const setSettlementStatus = useCallback((eventId: string, status: SettlementStatus) => {
    setSettlements((prev) => prev.map((s) => (s.eventId === eventId ? { ...s, status } : s)));
  }, []);

  const updateArtistProfile = useCallback(
    (patch: Partial<ArtistProfileDraft>) => setArtistProfile((prev) => ({ ...prev, ...patch })),
    [],
  );

  /* ---- chat ---- */
  const sendMessage = useCallback(
    (bookingId: string, sender: "host" | "artist", body: string): ChatMessage => {
      const flag = detectContactInfo(body);
      const created: ChatMessage = {
        id: `m${Date.now()}`,
        bookingId,
        sender,
        body,
        at: now(),
        flagged: Boolean(flag),
        flagReason: flag?.reason,
      };
      setMessages((prev) => [...prev, created]);
      return created;
    },
    [],
  );

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

  const reviewFlaggedMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, flagged: false } : m)));
  }, []);

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
      return created;
    },
    [],
  );

  const setApplicationStatus = useCallback((id: string, status: ApplicationStatus) => {
    setApplications((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
  }, []);

  /* ---- reviews ---- */
  const submitReview = useCallback(
    (bookingId: string, direction: Review["direction"], rating: number, body: string): Review => {
      const created: Review = {
        id: `rv${Date.now()}`,
        bookingId,
        direction,
        rating,
        body,
        createdAt: now(),
      };
      setReviews((prev) => [...prev, created]);
      return created;
    },
    [],
  );

  const value = useMemo<AppStore>(
    () => ({
      role,
      setRole,
      events,
      artists,
      bookings,
      tickets,
      settlements,
      messages,
      applications,
      reviews,
      venues,
      users,
      checkout,
      artistProfile,
      bankAdded,
      emptyLists,
      toasts,
      toast,
      dismissToast,
      eventById,
      artistById,
      venueById,
      bookingById,
      ticketByCode,
      messagesFor,
      reviewsFor,
      venueOf,
      soldOf,
      capacityOf,
      startCheckout,
      setGuestDetails,
      clearCheckout,
      completePurchase,
      cancelTicket,
      checkIn,
      setEmptyLists,
      updateEvent,
      setEventStatus,
      addTier,
      removeTier,
      sendBrief,
      counterBooking,
      acceptBooking,
      declineBooking,
      fundBooking,
      setBookingState,
      setSettlementStatus,
      updateArtistProfile,
      setBankAdded,
      countersUsed,
      sendMessage,
      setArtistKycStatus,
      resolveDispute,
      reviewFlaggedMessage,
      applyToGig,
      setApplicationStatus,
      submitReview,
    }),
    [
      role, events, artists, bookings, tickets, settlements, messages, applications, reviews,
      checkout, artistProfile, bankAdded, emptyLists, toasts, toast, dismissToast, eventById,
      artistById, venueById, bookingById, ticketByCode, messagesFor, reviewsFor, venueOf, soldOf,
      capacityOf, startCheckout, setGuestDetails, clearCheckout, completePurchase, cancelTicket,
      checkIn, updateEvent, setEventStatus, addTier, removeTier, sendBrief, counterBooking,
      acceptBooking, declineBooking, fundBooking, setBookingState, setSettlementStatus,
      updateArtistProfile, countersUsed, sendMessage, setArtistKycStatus, resolveDispute,
      reviewFlaggedMessage, applyToGig, setApplicationStatus, submitReview,
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
