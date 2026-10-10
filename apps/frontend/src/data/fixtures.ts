/**
 * Section 6 fixture data. Everything on screen reads from here, so the same
 * event looks identical wherever it appears. Extendable, never contradicted.
 */

export type Role = "out" | "listener" | "artist" | "host" | "admin";

export type EventStatus =
  | "draft"
  | "published"
  | "sales_closed"
  | "live"
  | "completed"
  | "cancelled";

export type BookingState =
  | "requested"
  | "negotiating"
  | "accepted"
  | "funded"
  | "performed"
  | "released"
  | "declined"
  | "cancelled"
  | "disputed";

export type TicketStatus = "valid" | "checked_in" | "cancelled";
export type SettlementStatus = "pending" | "held" | "paid";
export type KycStatus = "pending" | "verified" | "rejected";
export type DisputeOutcome = "release" | "refund";

export interface Venue {
  id: string;
  name: string;
  area: string;
  capacity: number;
  /** Primary photo, when the venue has one. */
  photo?: string;
}

export interface Artist {
  id: string;
  name: string;
  genres: string[];
  city: string;
  feeMin: number;
  feeMax: number;
  gigsPlayed: number;
  rating: number;
  bio: string;
  /** Primary photo, when the artist has one. */
  photo?: string;
  /** Razorpay Linked Account KYC status — gated at payout, not at signup (Q17). */
  kycStatus: KycStatus;
}

export interface Tier {
  /** Server tier id. Absent on fixture data; required to place a real order. */
  id?: string;
  name: string;
  price: number;
  capacity: number;
  sold: number;
}

export interface NaadaEvent {
  id: string;
  name: string;
  venueId: string;
  hostId: string;
  date: string;
  time: string;
  status: EventStatus;
  genres: string[];
  lineup: string[];
  tiers: Tier[];
  description: string;
  checkedIn: number;
  /** Gig board — the host still has an open slot and budget for it. */
  isSeekingArtist?: boolean;
  budgetMin?: number;
  budgetMax?: number;
}

export type ApplicationStatus = "pending" | "shortlisted" | "declined" | "withdrawn" | "converted";

export interface GigApplication {
  id: string;
  eventId: string;
  artistId: string;
  message: string;
  proposedRate?: number;
  status: ApplicationStatus;
  createdAt: string;
}

export interface Quote {
  by: "host" | "artist";
  amount: number;
  at: string;
  accepted?: boolean;
}

export interface DisputeResolution {
  outcome: DisputeOutcome;
  note: string;
  by: string;
  at: string;
}

export interface Booking {
  id: string;
  eventId: string;
  artistId: string;
  hostId: string;
  state: BookingState;
  agreedFee: number | null;
  message?: string;
  quotes: Quote[];
  /** Set when state is "disputed" — who raised it and why. */
  disputedBy?: "host" | "artist";
  disputeReason?: string;
  /** Set once an admin has resolved a dispute. */
  resolution?: DisputeResolution;
}

export interface Review {
  id: string;
  bookingId: string;
  direction: "host_to_artist" | "artist_to_host";
  rating: number;
  body: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  bookingId: string;
  sender: "host" | "artist";
  body: string;
  at: string;
  /** Section 12 — the disintermediation guard flags a message; it is never blocked. */
  flagged?: boolean;
  flagReason?: string;
}

export interface Ticket {
  id: string;
  code: string;
  eventId: string;
  tier: string;
  /**
   * The area of the venue's floor plan this ticket is for — "Table A", "VIP
   * Section" — when the buyer picked one at checkout. Blank for standing-room
   * gigs and for any venue without a layout, which is most of them.
   */
  seat?: string;
  price: number;
  fee: number;
  holder: string;
  status: TicketStatus;
  checkedInAt?: string;
}

export interface Settlement {
  eventId: string;
  gross: number;
  platformFee: number;
  status: SettlementStatus;
  payoutDate: string;
}

/** Platform economics — Section 1. */
/**
 * Naada's fee on an artist booking: 5% of the agreed fee, added on top and paid
 * by the venue. Must equal PLATFORM_FEE_PCT in the backend settings.
 */
export const PLATFORM_FEE_RATE = 0.05;
export const CONVENIENCE_FEE = 19;
export const TDS_RATE = 0.01;
export const MAX_COUNTERS = 3;

export const venues: Venue[] = [
  { id: "v1", name: "The Humming Tree", area: "Indiranagar", capacity: 180 },
  { id: "v2", name: "Bloom Coffee Roasters", area: "Koramangala", capacity: 45 },
  { id: "v3", name: "Jasmine Rooftop", area: "Gokulam", capacity: 45 },
  { id: "v4", name: "The Darbar", area: "VV Mohalla", capacity: 180 },
  { id: "v5", name: "The Silk Room", area: "Jayalakshmipuram", capacity: 60 },
  { id: "v6", name: "Vrinda's Courtyard", area: "Vijayanagar", capacity: 180 },
];

export const artists: Artist[] = [
  {
    id: "a1",
    name: "Rohan Kashyap",
    genres: ["Indie", "Folk"],
    city: "Bengaluru",
    feeMin: 2500,
    feeMax: 6000,
    gigsPlayed: 23,
    rating: 4.8,
    bio: "Fingerstyle guitarist and songwriter. Plays mostly originals, occasional Nick Drake.",
    kycStatus: "verified",
  },
  {
    id: "a2",
    name: "Tarana Collective",
    genres: ["Hindustani Fusion"],
    city: "Bengaluru",
    feeMin: 8000,
    feeMax: 15000,
    gigsPlayed: 41,
    rating: 4.9,
    bio: "Four-piece blending khayal vocals with double bass and drums.",
    kycStatus: "verified",
  },
  {
    id: "a3",
    name: "Neon Sabziwala",
    genres: ["Electronic", "Experimental"],
    city: "Bengaluru",
    feeMin: 4000,
    feeMax: 9000,
    gigsPlayed: 12,
    rating: 4.6,
    bio: "Modular synth sets built from field recordings of KR Market.",
    kycStatus: "pending",
  },
  {
    id: "a4",
    name: "Deepa & The Slow Trains",
    genres: ["Blues", "Rock"],
    city: "Bengaluru",
    feeMin: 6000,
    feeMax: 12000,
    gigsPlayed: 67,
    rating: 4.7,
    bio: "Loud, old-fashioned blues rock. Been playing the same three pubs for nine years.",
    kycStatus: "verified",
  },
  {
    id: "a5",
    name: "Kabir Menon",
    genres: ["Jazz"],
    city: "Bengaluru",
    feeMin: 3000,
    feeMax: 7000,
    gigsPlayed: 34,
    rating: 4.9,
    bio: "Piano. Standards, mostly. Will take requests if you buy him a filter coffee.",
    kycStatus: "pending",
  },
  {
    id: "a6",
    name: "Static Monsoon",
    genres: ["Post-rock"],
    city: "Bengaluru",
    feeMin: 5000,
    feeMax: 11000,
    gigsPlayed: 19,
    rating: 4.5,
    bio: "Instrumental. Long songs. Very loud endings.",
    kycStatus: "rejected",
  },
];

export const events: NaadaEvent[] = [
  {
    id: "e1",
    name: "Tuesday Open Mic",
    venueId: "v2",
    hostId: "h1",
    date: "2026-08-25",
    time: "19:30",
    status: "published",
    genres: ["Open Mic"],
    lineup: ["a1"],
    tiers: [{ name: "Free entry", price: 0, capacity: 45, sold: 31 }],
    description:
      "Sign-up sheet opens at 7. Six slots, ten minutes each. House guitar available.",
    checkedIn: 0,
  },
  {
    id: "e2",
    name: "Fuzz & Filter Coffee",
    venueId: "v1",
    hostId: "h1",
    date: "2026-08-28",
    time: "20:00",
    status: "published",
    genres: ["Blues", "Rock"],
    lineup: ["a4", "a6"],
    tiers: [
      { name: "Early bird", price: 349, capacity: 60, sold: 60 },
      { name: "General", price: 499, capacity: 120, sold: 74 },
    ],
    description: "Two bands, one long night. Doors 8pm, first set 8:45.",
    checkedIn: 47,
    isSeekingArtist: true,
    budgetMin: 2000,
    budgetMax: 4000,
  },
  {
    id: "e3",
    name: "Sunday Sundowner: Jazz",
    venueId: "v1",
    hostId: "h1",
    date: "2026-08-30",
    time: "17:00",
    status: "published",
    genres: ["Jazz"],
    lineup: ["a5"],
    tiers: [{ name: "General", price: 299, capacity: 90, sold: 12 }],
    description: "Rooftop. Standards and a slow sunset.",
    checkedIn: 0,
  },
  {
    id: "e6",
    name: "Gokulam Open Mic",
    venueId: "v3",
    hostId: "h1",
    date: "2026-08-25",
    time: "19:00",
    status: "published",
    genres: ["Open Mic"],
    lineup: ["a1"],
    tiers: [{ name: "Free entry", price: 0, capacity: 45, sold: 31 }],
    description: "Sign-up sheet opens at 6:30. Four slots, ten minutes each. House guitar available. Rooftop, bring a jacket.",
    checkedIn: 0,
  },
  {
    id: "e7",
    name: "Silk & Sound Sessions",
    venueId: "v4",
    hostId: "h1",
    date: "2026-08-28",
    time: "20:00",
    status: "published",
    genres: ["Carnatic Fusion", "Folk"],
    lineup: ["a2", "a1"],
    tiers: [{ name: "General", price: 299, capacity: 180, sold: 134 }],
    description: "An evening of Carnatic-folk crossover at VV Mohalla's oldest courtyard venue.",
    checkedIn: 0,
  },
  {
    id: "e8",
    name: "Chamundi Sessions",
    venueId: "v5",
    hostId: "h1",
    date: "2026-09-02",
    time: "19:30",
    status: "published",
    genres: ["Indie", "Folk"],
    lineup: ["a1", "a6"],
    tiers: [{ name: "General", price: 499, capacity: 60, sold: 10 }],
    description: "An intimate songwriter evening in Jayalakshmipuram. Quiet room, no amplification.",
    checkedIn: 0,
  },
  {
    id: "e9",
    name: "Parijata Unplugged",
    venueId: "v6",
    hostId: "h1",
    date: "2026-09-06",
    time: "18:00",
    status: "published",
    genres: ["Jazz"],
    lineup: ["a5"],
    tiers: [{ name: "General", price: 350, capacity: 180, sold: 180 }],
    description: "Sold-out evening of jazz standards in Vijayanagar's courtyard venue.",
    checkedIn: 0,
  },
  {
    id: "e4",
    name: "Monsoon Modular",
    venueId: "v2",
    hostId: "h1",
    date: "2026-09-04",
    time: "20:30",
    status: "draft",
    genres: ["Electronic"],
    lineup: ["a3"],
    tiers: [{ name: "General", price: 400, capacity: 45, sold: 0 }],
    description: "",
    checkedIn: 0,
  },
  {
    id: "e5",
    name: "Fusion Fridays",
    venueId: "v1",
    hostId: "h1",
    date: "2026-08-14",
    time: "20:00",
    status: "completed",
    genres: ["Hindustani Fusion"],
    lineup: ["a2"],
    tiers: [{ name: "General", price: 599, capacity: 150, sold: 138 }],
    description: "Past event. Used to demo settlements.",
    checkedIn: 131,
  },
];

export const bookings: Booking[] = [
  {
    id: "b1",
    eventId: "e2",
    artistId: "a4",
    hostId: "h1",
    state: "funded",
    agreedFee: 9000,
    message: "Two 45 minute sets, you close the night. Backline is on us.",
    quotes: [
      { by: "host", amount: 7500, at: "2026-08-10T11:04:00" },
      { by: "artist", amount: 10000, at: "2026-08-10T14:22:00" },
      { by: "host", amount: 9000, at: "2026-08-11T09:15:00" },
      { by: "artist", amount: 9000, at: "2026-08-11T09:40:00", accepted: true },
    ],
  },
  {
    id: "b2",
    eventId: "e3",
    artistId: "a5",
    hostId: "h1",
    state: "negotiating",
    agreedFee: null,
    message: "90 minute set, two halves, rooftop. Piano is tuned, promise.",
    quotes: [
      { by: "host", amount: 4000, at: "2026-08-18T16:00:00" },
      { by: "artist", amount: 5500, at: "2026-08-18T18:30:00" },
    ],
  },
  {
    id: "b3",
    eventId: "e5",
    artistId: "a2",
    hostId: "h1",
    state: "released",
    agreedFee: 12000,
    message: "Headline slot, 75 minutes.",
    quotes: [
      { by: "host", amount: 12000, at: "2026-08-02T10:00:00", accepted: true },
    ],
  },
  {
    id: "b4",
    eventId: "e4",
    artistId: "a3",
    hostId: "h1",
    state: "requested",
    agreedFee: null,
    message: "Late slot, modular only. We can hold the room till 1am.",
    quotes: [{ by: "host", amount: 6000, at: "2026-08-19T20:10:00" }],
  },
  {
    id: "b5",
    eventId: "e7",
    artistId: "a2",
    hostId: "h1",
    state: "disputed",
    agreedFee: 12000,
    message: "Headline slot, two 40 minute sets.",
    quotes: [{ by: "host", amount: 12000, at: "2026-08-05T10:00:00", accepted: true }],
    disputedBy: "host",
    disputeReason:
      "Band arrived 40 minutes late and played one 30 minute set instead of two 40 minute sets.",
  },
];

export const reviews: Review[] = [
  {
    id: "rv1",
    bookingId: "b3",
    direction: "host_to_artist",
    rating: 5,
    body: "Tarana Collective were incredible — professional, on time, and the room loved them.",
    createdAt: "2026-08-15T09:00:00",
  },
];

export const gigApplications: GigApplication[] = [
  {
    id: "ga1",
    eventId: "e2",
    artistId: "a6",
    message:
      "Would love to open — we've got a shorter instrumental set that'd work well before the headliner.",
    proposedRate: 3000,
    status: "pending",
    createdAt: "2026-08-12T09:00:00",
  },
];

export const messages: ChatMessage[] = [
  {
    id: "m1",
    bookingId: "b1",
    sender: "host",
    body: "Hey! Loved your set at Chamundi Sessions — any chance you're free the 28th?",
    at: "2026-08-10T10:40:00",
  },
  {
    id: "m2",
    bookingId: "b1",
    sender: "artist",
    body: "Yeah, that works. What time are you thinking and what's the backline situation?",
    at: "2026-08-10T10:58:00",
  },
  {
    id: "m3",
    bookingId: "b1",
    sender: "host",
    body: "Doors 8, you'd close around 10:30. We've got a full backline already.",
    at: "2026-08-10T11:02:00",
  },
  {
    id: "m4",
    bookingId: "b5",
    sender: "host",
    body: "You were 40 minutes late and only played one set — that's not what we agreed.",
    at: "2026-08-15T23:10:00",
  },
  {
    id: "m5",
    bookingId: "b5",
    sender: "artist",
    body: "Traffic on the ring road, I messaged the venue phone as soon as I could.",
    at: "2026-08-15T23:22:00",
  },
  {
    id: "m6",
    bookingId: "b2",
    sender: "host",
    body: "Easier if you just WhatsApp me on 98450 11223 for the details",
    at: "2026-08-18T18:40:00",
    flagged: true,
    flagReason: "mention of WhatsApp",
  },
];

export const tickets: Ticket[] = [
  {
    id: "t1",
    code: "NAADA-7K2M-QX91",
    eventId: "e2",
    tier: "General",
    price: 499,
    fee: 19,
    holder: "Meera Raghavan",
    status: "valid",
  },
  {
    id: "t2",
    code: "NAADA-3P8L-VB40",
    eventId: "e1",
    tier: "Free entry",
    price: 0,
    fee: 0,
    holder: "Meera Raghavan",
    status: "valid",
  },
  {
    id: "t3",
    code: "NAADA-9D1F-RT27",
    eventId: "e5",
    tier: "General",
    price: 599,
    fee: 19,
    holder: "Meera Raghavan",
    status: "checked_in",
    checkedInAt: "20:14",
  },
];

export const users = {
  listener: { id: "u1", name: "Meera Raghavan", phone: "+91 98450 11223" },
  artist: { id: "a1", name: "Rohan Kashyap", phone: "+91 99001 44556" },
  host: {
    id: "h1",
    name: "Sonal Fernandes",
    org: "The Humming Tree",
    phone: "+91 98860 77889",
    kycStatus: "verified",
  },
  admin: { id: "adm1", name: "Priya Shenoy", phone: "+91 90000 00000" },
} as const;

export const settlements: Settlement[] = [
  { eventId: "e5", gross: 82662, platformFee: 5786, status: "paid", payoutDate: "2026-08-16" },
  { eventId: "e2", gross: 57826, platformFee: 4048, status: "held", payoutDate: "2026-08-29" },
  { eventId: "e3", gross: 3588, platformFee: 251, status: "pending", payoutDate: "2026-08-31" },
];

export const ALL_GENRES = [
  "Open Mic",
  "Indie",
  "Folk",
  "Blues",
  "Rock",
  "Jazz",
  "Electronic",
  "Experimental",
  "Hindustani Fusion",
  "Carnatic Fusion",
  "Post-rock",
];

export const ALL_AREAS = [
  "Indiranagar",
  "Koramangala",
  "Gokulam",
  "VV Mohalla",
  "Jayalakshmipuram",
  "Vijayanagar",
  "Nazarbad",
];
