import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { HostHomeLandingScreen } from "./host-home-landing";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMyEvents: vi.fn(),
    getEvent: vi.fn(),
    getAllArtists: vi.fn(),
    getAllEvents: vi.fn(),
  };
});
vi.mock("./home-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./home-data")>();
  const empty = () => Promise.resolve({ count: 0, results: [] } as never);
  return {
    ...actual,
    getGigApplications: vi.fn(empty),
    getBookingConversations: vi.fn(empty),
    getBookingOrders: vi.fn(empty),
  };
});

/**
 * A host has one home, and it reads only their own events (`getMyEvents`), never the public
 * catalogue. The console layout around it is the one every other host page uses.
 */
const mine = {
  id: "ev-mine",
  title: "Gokulam Open Mic",
  start_datetime: "2099-01-10T19:00:00Z",
  end_datetime: "2099-01-10T22:00:00Z",
  status: "published",
  venue: "v1",
  venue_name: "Gokulam Music Hall",
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/host"]}>
      <AppStoreProvider seed={{ events: [], artists: [], venues: [] }}>
        <HostHomeLandingScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("HostHomeLandingScreen", () => {
  beforeEach(() => {
    vi.mocked(api.getMyEvents).mockReset();
    vi.mocked(api.getMyEvents).mockResolvedValue({ count: 1, next: null, previous: null, results: [mine] } as never);
    vi.mocked(api.getEvent).mockResolvedValue({
      ...mine,
      ticket_tiers: [{ id: "t1", name: "General", price: "200.00", total_quantity: 50, sold_quantity: 10 }],
    } as never);
    vi.mocked(api.getAllArtists).mockResolvedValue([] as never);
    vi.mocked(api.getAllEvents).mockResolvedValue([] as never);
  });

  it("lists the host's own upcoming night with its sold count", async () => {
    renderScreen();
    expect(await screen.findByText("Gokulam Open Mic")).toBeInTheDocument();
    expect(await screen.findByText("10 / 50 sold")).toBeInTheDocument();
  });

  it("sits in the host console, with the host's own navigation", async () => {
    renderScreen();
    await screen.findByText("Gokulam Open Mic");
    expect(screen.getAllByRole("navigation", { name: "Console" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Settlements").length).toBeGreaterThan(0);
  });

  it("no longer offers the venue layout designer in the navigation", async () => {
    renderScreen();
    await screen.findByText("Gokulam Open Mic");
    expect(screen.queryByRole("link", { name: "Venue" })).not.toBeInTheDocument();
  });

  it("says it is loading rather than claiming there is nothing", async () => {
    let release!: (v: unknown) => void;
    vi.mocked(api.getMyEvents).mockReturnValue(new Promise((r) => { release = r; }) as never);
    renderScreen();
    expect(screen.getByText(/Loading your events/i)).toBeInTheDocument();
    expect(screen.queryByText("No nights coming up")).not.toBeInTheDocument();

    release({ count: 0, next: null, previous: null, results: [] });
    await waitFor(() => expect(screen.getByText("No nights coming up")).toBeInTheDocument());
  });
});
