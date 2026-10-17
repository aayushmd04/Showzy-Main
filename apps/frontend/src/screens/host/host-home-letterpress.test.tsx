import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { HostHomeLetterpressScreen } from "./host-home-letterpress";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMyEvents: vi.fn() };
});

/**
 * The bug this pins: the dashboard read the store's `events`, which is the
 * *public* catalogue — every published event on the platform. A host saw
 * other venues' nights listed among their own, and "Revenue (est.)" was the
 * sum of every ticket Showzy had ever sold, presented as theirs.
 *
 * So the store is seeded here with an event belonging to somebody else, and
 * the assertions are that it never appears and never counts.
 */
const mine = {
  id: "ev-mine",
  title: "Gokulam Open Mic",
  start_datetime: "2099-01-10T19:00:00Z",
  end_datetime: "2099-01-10T22:00:00Z",
  status: "published",
  description: "",
  genres: [],
  venue: "v1",
  venue_name: "Gokulam Music Hall",
  ticket_tiers: [{ id: "t1", name: "General", price: "200.00", total_quantity: 50, sold_quantity: 10 }],
};

const someoneElses = {
  id: "ev-theirs",
  name: "Rangashankara Jazz",
  venueId: "v2",
  hostId: "other",
  date: "2099-02-02",
  time: "20:00",
  status: "published" as const,
  genres: ["Jazz"],
  lineup: [],
  tiers: [{ name: "General", price: 1000, capacity: 100, sold: 100 }],
  description: "",
  checkedIn: 0,
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/host"]}>
      <AppStoreProvider seed={{ events: [someoneElses], artists: [], venues: [] }}>
        <HostHomeLetterpressScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("HostHomeLetterpressScreen", () => {
  const getMyEvents = vi.mocked(api.getMyEvents);

  beforeEach(() => {
    getMyEvents.mockReset();
    getMyEvents.mockResolvedValue({ count: 1, next: null, previous: null, results: [mine] } as never);
  });

  it("lists the host's own events", async () => {
    renderScreen();
    // Their next gig is named twice — once in "Next Up", once in the table.
    expect(await screen.findAllByText("Gokulam Open Mic")).not.toHaveLength(0);
  });

  it("never shows an event belonging to another host", async () => {
    renderScreen();
    await screen.findAllByText("Gokulam Open Mic");
    expect(screen.queryByText("Rangashankara Jazz")).not.toBeInTheDocument();
  });

  it("counts revenue from this host's sales alone", async () => {
    renderScreen();
    // 10 sold x ₹200 from their own event. The seeded event belonging to
    // someone else would have added ₹100,000 to this figure.
    expect(await screen.findByText("₹2,000")).toBeInTheDocument();
    expect(screen.queryByText("₹102,000")).not.toBeInTheDocument();
  });

  it("says it is loading rather than claiming there is nothing", async () => {
    // An empty state that flashes before the fetch lands tells a host with a
    // full calendar that they have no events.
    let release!: (v: unknown) => void;
    getMyEvents.mockReturnValue(new Promise((r) => { release = r; }) as never);

    renderScreen();
    expect(screen.getByText(/Loading your events/i)).toBeInTheDocument();
    expect(screen.queryByText("No events yet")).not.toBeInTheDocument();

    release({ count: 0, next: null, previous: null, results: [] });
    await waitFor(() => expect(screen.getByText("No events yet")).toBeInTheDocument());
  });
});
