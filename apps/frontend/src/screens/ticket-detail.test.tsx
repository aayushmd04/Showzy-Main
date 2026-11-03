import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import * as api from "@/lib/api";
import * as eventData from "@/components/naada/event-data";
import type { NaadaEvent, Ticket } from "@/data/fixtures";
import { TicketDetailScreen } from "./ticket-detail";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
  transferTicketApi: vi.fn(),
}));
vi.mock("@/components/naada/event-data", async (orig) => ({
  ...(await orig<typeof import("@/components/naada/event-data")>()),
  loadEventDetail: vi.fn().mockRejectedValue(new Error("offline")),
}));

const event: NaadaEvent = {
  id: "e1", name: "Friday Raga", venueId: "v1", hostId: "h1", date: "2099-01-10", time: "19:00",
  status: "published", genres: [], lineup: [], tiers: [{ name: "General", price: 500, capacity: 50, sold: 1 }],
  description: "", checkedIn: 0,
};
const ticket = (status: Ticket["status"] = "valid"): Ticket => ({
  id: "t1", code: "TKT-1", eventId: "e1", tier: "General", price: 0, fee: 0, holder: "Anita", status,
});

function open(status: Ticket["status"] = "valid") {
  return render(
    <MemoryRouter initialEntries={["/tickets/TKT-1"]}>
      <AppStoreProvider seed={{ events: [event], tickets: [ticket(status)] }}>
        <AuthSheetProvider>
          <Routes>
            <Route path="/tickets/:code" element={<TicketDetailScreen />} />
            <Route path="/tickets" element={<p>MY TICKETS</p>} />
          </Routes>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Transferring a ticket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(eventData.loadEventDetail).mockRejectedValue(new Error("offline"));
  });

  it("explains what happens before anything is sent", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: /Transfer/ }));
    expect(screen.getByText(/your copy of the QR code stops working/i)).toBeInTheDocument();
    expect(screen.getByText(/we'll let them know/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send ticket" })).toBeDisabled();
  });

  it("sends the ticket to the typed address and returns to My tickets", async () => {
    vi.mocked(api.transferTicketApi).mockResolvedValue({} as api.ApiTicket);
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: /Transfer/ }));
    await user.type(screen.getByLabelText("Their email address"), "  friend@example.com ");
    await user.click(screen.getByRole("button", { name: "Send ticket" }));
    await waitFor(() => expect(api.transferTicketApi).toHaveBeenCalledWith("t1", "friend@example.com"));
    expect(await screen.findByText("MY TICKETS")).toBeInTheDocument();
  });

  it("says so when the recipient has no account, and keeps the ticket", async () => {
    vi.mocked(api.transferTicketApi).mockRejectedValue(
      new api.ApiError(404, "No Showzy account with that email — they'll need to sign up first."),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: /Transfer/ }));
    await user.type(screen.getByLabelText("Their email address"), "nobody@example.com");
    await user.click(screen.getByRole("button", { name: "Send ticket" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(/couldn't transfer|no longer on Showzy|no Showzy account/i);
    expect(screen.queryByText("MY TICKETS")).not.toBeInTheDocument();
  });

  it("offers no transfer for a ticket that has already been used", async () => {
    open("checked_in");
    await screen.findByText(/Friday Raga/);
    expect(screen.queryByRole("button", { name: /Transfer/ })).not.toBeInTheDocument();
  });
});
