import { useEffect } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import * as api from "@/lib/api";
import type { Booking } from "@/data/fixtures";
import { BookingThreadScreen } from "./booking-thread";

/**
 * The thread reads and writes the server's conversation. This fakes that
 * server in memory — one `server` shared by every rendered "browser", each with
 * its own SWR cache and signed-in user — so what one side sends is what the
 * other side's thread loads.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    swrFetcher: vi.fn(),
    sendMessage: vi.fn(),
    makeOffer: vi.fn(),
    acceptOffer: vi.fn(),
    rejectOffer: vi.fn(),
    cancelBookingOrder: vi.fn(),
    reviewBooking: vi.fn(),
  };
});

// The real not-found page wants the public shell's providers; all that matters here is that it is shown.
vi.mock("./not-found", () => ({ NotFoundScreen: () => <p>Page not found</p> }));

const HOST = { id: "host-user", email: "host@x.in", full_name: "Hema Host", role: "host" };
const ARTIST = { id: "artist-user", email: "art@x.in", full_name: "Newbie Singer", role: "artist" };

interface Server {
  convo: api.ApiConversation;
  messages: api.ApiMessage[];
  reviews: api.ApiBookingReview[];
  seq: number;
}

let server: Server;

function offerOf(over: Partial<api.ApiOffer> = {}): api.ApiOffer {
  return {
    id: "offer-1",
    conversation: "convo-1",
    proposed_by: HOST.id,
    proposed_by_name: HOST.full_name,
    fee_amount: "7500.00",
    performance_date: "2026-11-09",
    performance_duration_minutes: 90,
    set_count: 2,
    notes: "Backline provided.",
    status: "pending",
    expires_at: "2026-11-30T00:00:00Z",
    created_at: "2026-10-19T10:00:00Z",
    ...over,
  };
}

function freshServer(): Server {
  const offer = offerOf();
  return {
    seq: 0,
    reviews: [],
    convo: {
      id: "convo-1",
      organizer: "org-1",
      organizer_name: "Fresh Hall",
      artist: "artist-1",
      artist_name: "Newbie Singer",
      event: "event-1",
      event_title: "Fresh Night",
      pending_offer: offer,
      order_id: null,
      created_at: "2026-10-19T10:00:00Z",
    },
    messages: [
      {
        id: "m-offer",
        sender: HOST.id,
        sender_name: HOST.full_name,
        content: "Offer: ₹7500.00 for 2026-11-09",
        message_type: "offer",
        linked_offer: offer.id,
        offer,
        is_flagged: false,
        created_at: "2026-10-19T10:00:00Z",
      },
    ],
  };
}

function say(from: typeof HOST, content: string): api.ApiMessage {
  const message: api.ApiMessage = {
    id: `m-${++server.seq}`,
    sender: from.id,
    sender_name: from.full_name,
    content,
    message_type: "text",
    is_flagged: false,
    created_at: `2026-10-19T11:0${server.seq}:00Z`,
  };
  server.messages.push(message);
  return message;
}

function wireApi(as: { current: typeof HOST }) {
  vi.mocked(api.swrFetcher).mockImplementation((async (path: string) => {
    if (path === "/conversations/") return { results: [server.convo] };
    if (path === "/conversations/convo-1/messages/") return { results: [...server.messages] };
    if (path === "/orders/order-1/reviews/") {
      return { count: server.reviews.length, my_direction: as.current === HOST ? "host_to_artist" : "artist_to_host", results: [...server.reviews] };
    }
    throw new Error(`unexpected GET ${path}`);
  }) as typeof api.swrFetcher);
  vi.mocked(api.sendMessage).mockImplementation(async (_id, content) => say(as.current, content));
  vi.mocked(api.makeOffer).mockImplementation(async (_id, data) => {
    const prior = server.convo.pending_offer;
    if (prior && data.counter_of === prior.id) {
      for (const m of server.messages) if (m.offer?.id === prior.id) m.offer = { ...m.offer, status: "countered" };
    }
    const offer = offerOf({
      id: `offer-${++server.seq + 1}`,
      proposed_by: as.current.id,
      proposed_by_name: as.current.full_name,
      fee_amount: `${data.fee_amount}.00`,
      notes: data.notes ?? "",
      counter_of_id: data.counter_of ?? null,
    });
    server.convo.pending_offer = offer;
    server.messages.push({
      id: `m-${offer.id}`,
      sender: as.current.id,
      sender_name: as.current.full_name,
      content: `Offer: ₹${offer.fee_amount}`,
      message_type: "offer",
      linked_offer: offer.id,
      offer,
      is_flagged: false,
      created_at: "2026-10-19T12:00:00Z",
    });
    return offer;
  });
  vi.mocked(api.acceptOffer).mockImplementation(async () => {
    const accepted = server.convo.pending_offer!;
    for (const m of server.messages) if (m.offer?.id === accepted.id) m.offer = { ...m.offer, status: "accepted" };
    server.convo.pending_offer = null;
    server.convo.order_id = "order-1";
    return {} as api.ApiOrder;
  });
  vi.mocked(api.reviewBooking).mockImplementation(async (_id, data) => {
    const review: api.ApiBookingReview = {
      id: `rv-${++server.seq}`,
      direction: as.current === HOST ? "host_to_artist" : "artist_to_host",
      rating: data.rating,
      body: data.body,
      created_at: "2026-11-10T10:00:00Z",
    };
    server.reviews.push(review);
    return review;
  });
  vi.mocked(api.rejectOffer).mockImplementation(async () => {
    const declined = server.convo.pending_offer!;
    for (const m of server.messages) if (m.offer?.id === declined.id) m.offer = { ...m.offer, status: "rejected" };
    server.convo.pending_offer = null;
    return declined;
  });
}

/** Signs the fake browser in as `user` once the store exists. */
function SignedInAs({ user }: { user: typeof HOST }) {
  const { setRole, setCurrentUser } = useStore();
  useEffect(() => {
    setCurrentUser(user);
    setRole(user.role as "host" | "artist");
  }, [setCurrentUser, setRole, user]);
  return null;
}

/** One browser: its own SWR cache, its own store, a signed-in user, on a URL. */
function openAs(user: typeof HOST, path = "/bookings/convo-1", bookings: Booking[] = []) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[path]}>
        <AppStoreProvider seed={{ bookings }}>
          <SignedInAs user={user} />
          <Routes>
            <Route path="/bookings/:id" element={<BookingThreadScreen />} />
          </Routes>
        </AppStoreProvider>
      </MemoryRouter>
    </SWRConfig>,
  );
}

describe("BookingThreadScreen", () => {
  const as = { current: HOST };

  beforeEach(() => {
    vi.resetAllMocks();
    api.tokens.set("access", "refresh");
    server = freshServer();
    as.current = HOST;
    wireApi(as);
    // The store tries to hydrate from the network after an accepted offer.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    api.tokens.clear();
    vi.restoreAllMocks();
  });

  it("draws the offer in the thread as a card, with the notes and where it stands", async () => {
    openAs(HOST);
    const card = await screen.findByTestId("offer-card");
    expect(within(card).getByText("₹7,500")).toBeInTheDocument();
    expect(within(card).getByText(/You offered/)).toBeInTheDocument();
    expect(within(card).getByText(/Backline provided/)).toBeInTheDocument();
    expect(within(card).getByText("PENDING")).toBeInTheDocument();
    // Fresh Night · the artist is who the host is talking to.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fresh Night · Newbie Singer");
  });

  it("the host's message reaches the artist's thread, and the reply comes back, across reloads", async () => {
    const user = userEvent.setup();
    const hostView = openAs(HOST);
    await user.type(await screen.findByLabelText("Message"), "Is the 9th still free?");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenCalledWith("convo-1", "Is the 9th still free?"));
    expect(await screen.findByText("Is the 9th still free?")).toBeInTheDocument();
    hostView.unmount();

    // The artist opens the thread in their own browser.
    as.current = ARTIST;
    const artistView = openAs(ARTIST);
    expect(await screen.findByText("Is the 9th still free?")).toBeInTheDocument();
    expect(screen.getByText(/Hema Host offered/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message"), "Yes, it is.");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(api.sendMessage).toHaveBeenLastCalledWith("convo-1", "Yes, it is."));
    artistView.unmount();

    // Back on the host's side after a reload: both messages are still there.
    as.current = HOST;
    openAs(HOST);
    expect(await screen.findByText("Is the 9th still free?")).toBeInTheDocument();
    expect(await screen.findByText("Yes, it is.")).toBeInTheDocument();
  });

  it("the artist counters, and the host sees the counter as a new card beside the old one", async () => {
    const user = userEvent.setup();
    as.current = ARTIST;
    const artistView = openAs(ARTIST);
    await user.type(await screen.findByLabelText("Counter offer amount"), "9000");
    await user.click(screen.getByRole("button", { name: "Counter" }));

    await waitFor(() => expect(api.makeOffer).toHaveBeenCalledTimes(1));
    expect(api.makeOffer).toHaveBeenCalledWith("convo-1", {
      fee_amount: "9000",
      performance_date: "2026-11-09",
      performance_duration_minutes: 90,
      set_count: 2,
      counter_of: "offer-1",
    });
    artistView.unmount();

    as.current = HOST;
    openAs(HOST);
    const cards = await screen.findAllByTestId("offer-card");
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("COUNTERED")).toBeInTheDocument();
    expect(within(cards[1]).getByText("₹9,000")).toBeInTheDocument();
    expect(within(cards[1]).getByText(/Newbie Singer countered/)).toBeInTheDocument();
    // The host now has the move: accept, counter or decline.
    expect(screen.getByRole("button", { name: /Accept ₹9,000/ })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Withdraw offer" })).not.toBeInTheDocument();
  });

  it("the host who made the offer can withdraw it but not accept it", async () => {
    const user = userEvent.setup();
    openAs(HOST);
    expect(screen.queryByRole("button", { name: /^Accept/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Withdraw offer" }));
    await waitFor(() => expect(api.rejectOffer).toHaveBeenCalledWith("offer-1"));
    expect(await screen.findByText("REJECTED")).toBeInTheDocument();
    // With nothing on the table either side may make a fresh offer.
    // The form starts from the terms that were just turned down.
    expect(await screen.findByRole("button", { name: "Make an offer" })).toBeEnabled();
    expect(screen.getByLabelText("Offer amount")).toHaveValue("7500");
    expect(screen.getByLabelText("Performance date")).toHaveValue("2026-11-09");
  });

  it("accepting an offer turns the thread into the booking", async () => {
    const user = userEvent.setup();
    as.current = ARTIST;
    openAs(ARTIST);
    await user.click(await screen.findByRole("button", { name: /Accept ₹7,500/ }));
    await waitFor(() => expect(api.acceptOffer).toHaveBeenCalledWith("offer-1"));
    expect(await screen.findByText("ACCEPTED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Accept/ })).not.toBeInTheDocument();
  });

  it("a booking link opens the same thread as the conversation's own link", async () => {
    server.convo.order_id = "order-1";
    server.convo.pending_offer = null;
    openAs(HOST, "/bookings/order-1");
    expect(await screen.findByTestId("offer-card")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fresh Night");
  });

  describe("after the gig", () => {
    const released: Booking = {
      id: "order-1",
      eventId: "event-1",
      artistId: "artist-1",
      hostId: "org-1",
      state: "released",
      agreedFee: 7500,
      quotes: [],
    };

    beforeEach(() => {
      server.convo.order_id = "order-1";
      server.convo.pending_offer = null;
    });

    it("each side rates the other once, and sees the other's rating", async () => {
      const user = userEvent.setup();
      server.reviews.push({
        id: "rv-0",
        direction: "artist_to_host",
        rating: 5,
        body: "Lovely venue.",
        created_at: "2026-11-10T09:00:00Z",
      });
      const hostView = openAs(HOST, "/bookings/convo-1", [released]);
      expect(await screen.findByText("Rate Newbie Singer")).toBeInTheDocument();
      expect(screen.getByText(/Lovely venue/)).toBeInTheDocument();

      await user.click(screen.getByRole("radio", { name: "4 stars" }));
      await user.type(screen.getByLabelText("Review"), "On time, great set.");
      await user.click(screen.getByRole("button", { name: "Submit review" }));
      await waitFor(() =>
        expect(api.reviewBooking).toHaveBeenCalledWith("order-1", { rating: 4, body: "On time, great set." }),
      );
      expect(await screen.findByText("Your review")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Submit review" })).not.toBeInTheDocument();
      hostView.unmount();

      // After a reload the artist sees what the host wrote about them.
      as.current = ARTIST;
      openAs(ARTIST, "/bookings/convo-1", [released]);
      expect(await screen.findByText(/On time, great set/)).toBeInTheDocument();
    });

    it("says why a review was refused", async () => {
      vi.mocked(api.reviewBooking).mockRejectedValue(new api.ApiError(409, "You have already reviewed this booking."));
      const user = userEvent.setup();
      openAs(HOST, "/bookings/convo-1", [released]);
      await user.click(await screen.findByRole("button", { name: "Submit review" }));
      expect(await screen.findByRole("alert")).toHaveTextContent(/already reviewed/);
    });

    it("offers no rating before the gig is done", async () => {
      openAs(HOST, "/bookings/convo-1", [{ ...released, state: "funded" }]);
      await screen.findByTestId("offer-card");
      expect(screen.queryByText(/^Rate /)).not.toBeInTheDocument();
    });
  });

  it("says what went wrong when a message cannot be sent, and keeps the draft", async () => {
    vi.mocked(api.sendMessage).mockRejectedValue(new api.ApiError(403, "You are not a participant in this conversation."));
    const user = userEvent.setup();
    openAs(HOST);
    await user.type(await screen.findByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/not a participant|send your message/i);
    expect(screen.getByLabelText("Message")).toHaveValue("hello");
  });

  it("shows not-found for a thread the signed-in person is not in", async () => {
    openAs(HOST, "/bookings/someone-elses");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.queryByTestId("offer-card")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Message")).not.toBeInTheDocument();
  });
});
