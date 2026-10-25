import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { HostDoorScannerScreen } from "./host-door-scanner";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  scanTicket: vi.fn(),
  getEvent: vi.fn(),
  getEventAttendees: vi.fn(),
  getMyGate: vi.fn(),
}));

const guest = (over: Partial<api.ApiAttendee>): api.ApiAttendee => ({
  id: "a1", ticket_number: "TON-00001", qr_data: "qr-1", holder_name: "Asha Rao",
  tier_name: "General", seat_label: "", status: "valid", checked_in_at: null, ...over,
});

function open(variant: "host" | "gate" = "host") {
  return render(
    <MemoryRouter initialEntries={[variant === "gate" ? "/gate/e1/door" : "/host/events/e1/door"]}>
      <AppStoreProvider seed={{}}>
        <Routes>
          <Route path="/host/events/:id/door" element={<HostDoorScannerScreen />} />
          <Route path="/gate/:id/door" element={<HostDoorScannerScreen variant="gate" />} />
        </Routes>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("door scanner", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    vi.mocked(api.getEvent).mockResolvedValue({ id: "e1", title: "Friday Raga" } as api.ApiEvent);
    vi.mocked(api.getEventAttendees).mockResolvedValue({
      event: "e1", count: 3,
      results: [
        guest({}),
        guest({ id: "a2", holder_name: "Dev Menon", qr_data: "qr-2", ticket_number: "TON-00002", status: "used" }),
        guest({ id: "a3", holder_name: "Meera Iyer", qr_data: "qr-3", ticket_number: "TON-00003", status: "used" }),
      ],
    });
  });

  it("opens straight from a bookmark and counts people already inside, not just this visit's scans", async () => {
    open();
    expect(await screen.findByText("Friday Raga")).toBeInTheDocument();
    // 2 of the 3 tickets issued were scanned before this page was opened.
    expect(await screen.findByText("2 / 3")).toBeInTheDocument();
  });

  it("shows a refusal — never 'let them in' — for a code the server rejects", async () => {
    vi.mocked(api.scanTicket).mockResolvedValue({ valid: false, detail: "Not a Showzy ticket." });
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText("Search by name or ticket number"), "asha");
    await user.click(await screen.findByRole("button", { name: /Asha Rao/ }));

    expect(await screen.findByText("Not a valid ticket")).toBeInTheDocument();
    expect(screen.getByText("Not a Showzy ticket.")).toBeInTheDocument();
    expect(screen.queryByText("Let them in")).not.toBeInTheDocument();
    expect(localStorage.getItem("naada_door_queue")).toBeNull();
  });

  it("queues a scan only when the network is actually down", async () => {
    vi.mocked(api.scanTicket).mockRejectedValue(new TypeError("Failed to fetch"));
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText("Search by name or ticket number"), "asha");
    await user.click(await screen.findByRole("button", { name: /Asha Rao/ }));

    expect(await screen.findByText("Let them in")).toBeInTheDocument();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("naada_door_queue")!)).toEqual(["qr-1"]));
  });

  it("admits a valid ticket and moves the count", async () => {
    vi.mocked(api.scanTicket).mockResolvedValue({
      valid: true,
      ticket: { holder_name: "Asha Rao", tier_name: "General", ticket_number: "TON-00001" } as api.ApiTicket,
    });
    const user = userEvent.setup();
    open();
    await user.type(await screen.findByLabelText("Search by name or ticket number"), "asha");
    await user.click(await screen.findByRole("button", { name: /Asha Rao/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Asha Rao");
    expect(api.scanTicket).toHaveBeenCalledWith("qr-1");
    await waitFor(() => expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0));
  });

  it("a gatekeeper's header comes from their own assignment", async () => {
    vi.mocked(api.getMyGate).mockResolvedValue({
      invitations: [],
      assignments: [{
        id: "g1", label: "", open_now: true, opens: "", closes: "", scanned: 0,
        event: { id: "e1", title: "Friday Raga", venue: "Hall", starts_at: "", ends_at: "" },
      }],
    });
    open("gate");
    expect(await screen.findByText("Friday Raga")).toBeInTheDocument();
    expect(api.getEvent).not.toHaveBeenCalled();
  });
});
