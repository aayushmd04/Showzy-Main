import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import * as data from "./home-data";
import { ArtistHomeLandingScreen } from "./artist-home-landing";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getAllEvents: vi.fn(), getMyArtistProfile: vi.fn() };
});
vi.mock("./home-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./home-data")>();
  return {
    ...actual,
    getGigApplications: vi.fn(),
    getBookingConversations: vi.fn(),
    getBookingOrders: vi.fn(),
  };
});

const order = (id: string, status: string, date: string, payout: string) => ({
  id,
  organizer: "o1",
  organizer_name: "Gokulam Music Productions",
  artist: "a1",
  artist_name: "Rahul & The Mysore Blues",
  event: "e1",
  event_title: "Live at Gokulam",
  status,
  gross_amount: "15750",
  artist_payout: payout,
  currency: "INR",
  performance_date: date,
  funded_at: null,
  created_at: "2026-01-01T00:00:00Z",
});

const convo = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizer: "o1",
  organizer_name: "Gokulam Music Productions",
  artist: "a1",
  artist_name: "Rahul & The Mysore Blues",
  event: null,
  is_active: true,
  last_message_at: null,
  latest_message: null,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/artist"]}>
      <AppStoreProvider seed={{ events: [], artists: [], venues: [] }}>
        <ArtistHomeLandingScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("ArtistHomeLandingScreen", () => {
  beforeEach(() => {
    vi.mocked(api.getAllEvents).mockResolvedValue([] as never);
    vi.mocked(api.getMyArtistProfile).mockResolvedValue({ stage_name: "Rahul & The Mysore Blues", profile_gaps: [] } as never);
    vi.mocked(data.getGigApplications).mockResolvedValue({ count: 0, results: [] });
    vi.mocked(data.getBookingConversations).mockResolvedValue({ count: 0, results: [] } as never);
    vi.mocked(data.getBookingOrders).mockResolvedValue({ count: 0, results: [] });
  });

  it("sits in the artist console", async () => {
    renderScreen();
    await screen.findAllByText("Rahul & The Mysore Blues");
    expect(screen.getAllByRole("navigation", { name: "Console" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Earnings").length).toBeGreaterThan(0);
  });

  it("shows money held in escrow and money already paid out", async () => {
    vi.mocked(data.getBookingOrders).mockResolvedValue({
      count: 3,
      results: [
        order("1", "funded", "2099-01-01", "14850"),
        order("2", "released", "2020-01-01", "9900"),
        order("3", "accepted", "2099-02-01", "5000"),
      ],
    });
    renderScreen();
    const escrow = (await screen.findByText("In escrow")).parentElement!;
    expect(escrow).toHaveTextContent("₹14,850");
    const paid = screen.getByText("Paid out").parentElement!;
    expect(paid).toHaveTextContent("₹9,900");
  });

  it("does not count a thread that already became a booking as a venue in talks", async () => {
    vi.mocked(data.getBookingConversations).mockResolvedValue({
      count: 2,
      results: [convo("c1", { order_id: "ord-1" }), convo("c2")],
    } as never);
    renderScreen();
    await waitFor(() => {
      const tile = screen.getByText("Venues in talks").parentElement!;
      expect(tile).toHaveTextContent("1");
    });
  });

  it("points out an offer a host has sent", async () => {
    vi.mocked(data.getBookingConversations).mockResolvedValue({
      count: 1,
      results: [convo("c1", { pending_offer: { proposed_by: "someone-else" } })],
    } as never);
    renderScreen();
    expect(await screen.findByText("A host sent you an offer.")).toBeInTheDocument();
  });
});
