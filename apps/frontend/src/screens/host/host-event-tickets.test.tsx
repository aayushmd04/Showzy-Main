import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { GuestList, TierManager } from "./host-event-tickets";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  createTier: vi.fn(),
  updateTier: vi.fn(),
  deleteTier: vi.fn(),
  getEventAttendees: vi.fn(),
}));

const TIER: api.ApiTier = {
  id: "t1", name: "General", name_kn: "", price: "250.00",
  total_quantity: 50, sold_quantity: 0, is_active: true, max_per_order: 10,
};

const wrap = (ui: React.ReactNode) =>
  render(
    <MemoryRouter>
      <AppStoreProvider seed={{}}>{ui}</AppStoreProvider>
    </MemoryRouter>,
  );

/** The modal moves focus to its first field a moment after opening; typing before then lands in the wrong place. */
const modalReady = () => waitFor(() => expect(screen.getByLabelText("Name")).toHaveFocus());

describe("TierManager", () => {
  const changed = vi.fn();
  beforeEach(() => {
    vi.resetAllMocks();
    changed.mockResolvedValue(undefined);
  });

  it("says what to do when nothing is on sale", () => {
    wrap(<TierManager eventId="e1" tiers={[]} onChanged={changed} />);
    expect(screen.getByText(/Nothing on sale yet/)).toBeInTheDocument();
  });

  it("adds a ticket with the price in rupees and tells the page to reload", async () => {
    vi.mocked(api.createTier).mockResolvedValue(TIER);
    const user = userEvent.setup();
    wrap(<TierManager eventId="e1" tiers={[]} onChanged={changed} />);

    await user.click(screen.getByRole("button", { name: /add a ticket/i }));
    await modalReady();
    await user.type(screen.getByLabelText("Name"), "Front row");
    await user.type(screen.getByLabelText(/Price/), "499");
    await user.type(screen.getByLabelText("How many"), "40");
    await user.click(screen.getByRole("button", { name: "Add ticket" }));

    await waitFor(() => expect(api.createTier).toHaveBeenCalledWith("e1", {
      name: "Front row", price: "499.00", total_quantity: 40, max_per_order: 10,
    }));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });

  it("won't send an incomplete ticket", async () => {
    const user = userEvent.setup();
    wrap(<TierManager eventId="e1" tiers={[]} onChanged={changed} />);
    await user.click(screen.getByRole("button", { name: /add a ticket/i }));
    await modalReady();
    await user.click(screen.getByRole("button", { name: "Add ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Give the ticket a name/);
    await user.type(screen.getByLabelText("Name"), "GA");
    await user.click(screen.getByRole("button", { name: "Add ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Enter a price/);
    expect(api.createTier).not.toHaveBeenCalled();
  });

  it("shows the server's reason when it refuses", async () => {
    vi.mocked(api.createTier).mockRejectedValue(new api.ApiError(400, "This event is over — tickets can't be added."));
    const user = userEvent.setup();
    wrap(<TierManager eventId="e1" tiers={[]} onChanged={changed} />);
    await user.click(screen.getByRole("button", { name: /add a ticket/i }));
    await modalReady();
    await user.type(screen.getByLabelText("Name"), "GA");
    await user.type(screen.getByLabelText(/Price/), "0");
    await user.type(screen.getByLabelText("How many"), "5");
    await user.click(screen.getByRole("button", { name: "Add ticket" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This event is over");
  });

  it("locks the price once tickets have sold, and doesn't send it", async () => {
    vi.mocked(api.updateTier).mockResolvedValue(TIER);
    const user = userEvent.setup();
    wrap(<TierManager eventId="e1" tiers={[{ ...TIER, sold_quantity: 3 }]} onChanged={changed} />);

    await user.click(screen.getByRole("button", { name: "Edit General" }));
    await modalReady();
    expect(screen.getByLabelText(/Price/)).toBeDisabled();
    await user.clear(screen.getByLabelText("How many"));
    await user.type(screen.getByLabelText("How many"), "60");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(api.updateTier).toHaveBeenCalledWith("e1", "t1", {
      name: "General", total_quantity: 60, max_per_order: 10,
    }));
  });

  it("pauses and resumes a ticket", async () => {
    vi.mocked(api.updateTier).mockResolvedValue({ ...TIER, is_active: false });
    const user = userEvent.setup();
    wrap(<TierManager eventId="e1" tiers={[TIER]} onChanged={changed} />);
    await user.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(api.updateTier).toHaveBeenCalledWith("e1", "t1", { is_active: false }));
  });

  it("marks a paused ticket as off sale", () => {
    wrap(<TierManager eventId="e1" tiers={[{ ...TIER, is_active: false }]} onChanged={changed} />);
    expect(screen.getByText("OFF SALE")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});

describe("GuestList", () => {
  const row = (over: Partial<api.ApiAttendee>): api.ApiAttendee => ({
    id: "a1", ticket_number: "TON-00001", qr_data: "q", holder_name: "Asha Rao",
    tier_name: "General", seat_label: "", status: "valid", checked_in_at: null, ...over,
  });

  beforeEach(() => vi.resetAllMocks());

  it("lists who booked, with seats, and counts who is already inside", async () => {
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      event: "e1", count: 3,
      results: [
        row({}),
        row({ id: "a2", holder_name: "Dev Menon", ticket_number: "TON-00002", seat_label: "Table 4 · Seat 2", status: "used" }),
        row({ id: "a3", holder_name: "Meera", ticket_number: "TON-00003" }),
      ],
    });
    const user = userEvent.setup();
    wrap(<GuestList eventId="e1" />);

    expect(await screen.findByText("3 booked · 1 checked in")).toBeInTheDocument();
    const dev = screen.getByText("Dev Menon").closest("tr")!;
    expect(within(dev).getByText("Table 4 · Seat 2")).toBeInTheDocument();
    expect(within(dev).getByText("CHECKED IN")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search the guest list"), "meera");
    expect(screen.queryByText("Asha Rao")).not.toBeInTheDocument();
    expect(screen.getByText("Meera")).toBeInTheDocument();
  });

  it("says so when nobody has booked yet", async () => {
    vi.mocked(api.getEventAttendees).mockResolvedValue({ event: "e1", count: 0, results: [] });
    wrap(<GuestList eventId="e1" />);
    expect(await screen.findByText(/No bookings yet/)).toBeInTheDocument();
  });

  it("offers a retry when the list won't load", async () => {
    vi.mocked(api.getEventAttendees).mockRejectedValueOnce(new api.ApiError(500, "boom"));
    vi.mocked(api.getEventAttendees).mockResolvedValueOnce({ event: "e1", count: 0, results: [] });
    const user = userEvent.setup();
    wrap(<GuestList eventId="e1" />);
    await user.click(await screen.findByRole("button", { name: /try again|retry/i }));
    expect(await screen.findByText(/No bookings yet/)).toBeInTheDocument();
  });
});
