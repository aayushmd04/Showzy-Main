import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { OfferInbox } from "./offer-inbox";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMyConversations: vi.fn(),
    acceptOffer: vi.fn(),
    rejectOffer: vi.fn(),
    makeOffer: vi.fn(),
  };
});

const offer = {
  id: "offer-1",
  conversation: "convo-1",
  proposed_by: "host-user",
  fee_amount: "7500.00",
  performance_date: "2026-11-09",
  performance_duration_minutes: 90,
  set_count: 2,
  notes: "Backline provided.",
  status: "pending",
  expires_at: new Date(Date.now() + 40 * 3_600_000).toISOString(),
  created_at: "2026-10-19T10:00:00Z",
};

const convo = {
  id: "convo-1",
  organizer: "org-1",
  organizer_name: "Fresh Hall",
  artist: "artist-1",
  artist_name: "Newbie Singer",
  event: "event-1",
  event_title: "Fresh Night",
  pending_offer: offer,
  created_at: "2026-10-19T10:00:00Z",
};

function renderInbox(viewer: "artist" | "host" = "artist", empty?: React.ReactNode) {
  return render(
    <MemoryRouter>
      <AppStoreProvider>
        <OfferInbox viewer={viewer} empty={empty} />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("OfferInbox", () => {
  const getMyConversations = vi.mocked(api.getMyConversations);
  const acceptOffer = vi.mocked(api.acceptOffer);
  const rejectOffer = vi.mocked(api.rejectOffer);
  const makeOffer = vi.mocked(api.makeOffer);

  beforeEach(() => {
    vi.resetAllMocks();
    getMyConversations.mockResolvedValue({ results: [convo] });
  });

  it("shows an offer a host sent: who, which night, the fee and the notes", async () => {
    renderInbox();
    expect(await screen.findByText("Fresh Night")).toBeInTheDocument();
    expect(screen.getByText(/Fresh Hall/)).toBeInTheDocument();
    expect(screen.getByText("₹7,500")).toBeInTheDocument();
    expect(screen.getByText(/2 sets/)).toBeInTheDocument();
    expect(screen.getByText(/Backline provided/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeEnabled();
  });

  it("names the artist, not the venue, on the host's side", async () => {
    renderInbox("host");
    expect(await screen.findByText(/Newbie Singer/)).toBeInTheDocument();
  });

  it("counters with the new fee against the offer it answers", async () => {
    makeOffer.mockResolvedValue({ ...offer, id: "offer-2" });
    const user = userEvent.setup();
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Counter" }));
    const fee = screen.getByLabelText("Your counter fee");
    await user.clear(fee);
    await user.type(fee, "9000");
    await user.click(screen.getByRole("button", { name: "Send counter" }));

    await waitFor(() => expect(makeOffer).toHaveBeenCalledTimes(1));
    expect(makeOffer).toHaveBeenCalledWith("convo-1", {
      fee_amount: "9000",
      performance_date: "2026-11-09",
      performance_duration_minutes: 90,
      set_count: 2,
      counter_of: "offer-1",
    });
  });

  it("accepts and declines through the API", async () => {
    acceptOffer.mockResolvedValue({} as never);
    rejectOffer.mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Accept" }));
    await waitFor(() => expect(acceptOffer).toHaveBeenCalledWith("offer-1"));

    await user.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(rejectOffer).toHaveBeenCalledWith("offer-1"));
  });

  it("says what went wrong when accepting fails, and leaves the offer in place", async () => {
    acceptOffer.mockRejectedValue(new api.ApiError(409, "Artist is already booked on 2026-11-09."));
    const user = userEvent.setup();
    renderInbox();

    await user.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already booked");
    expect(screen.getByText("Fresh Night")).toBeInTheDocument();
  });

  it("shows the empty state only when nothing is waiting", async () => {
    getMyConversations.mockResolvedValue({ results: [{ ...convo, pending_offer: null }] });
    renderInbox("artist", <p>No offers yet</p>);
    expect(await screen.findByText("No offers yet")).toBeInTheDocument();
  });
});
