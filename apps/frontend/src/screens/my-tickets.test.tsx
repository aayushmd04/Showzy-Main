import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// The shell's city picker asks the API for cities; keep the test off the network.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { daysFromNow } from "@/lib/format";
import type { NaadaEvent, Ticket } from "@/data/fixtures";
import { MyTicketsScreen } from "./my-tickets";

const event = (id: string, name: string, date: string, status: NaadaEvent["status"] = "published"): NaadaEvent => ({
  id, name, venueId: "v1", hostId: "h1", date, time: "20:00", status,
  genres: [], lineup: [], tiers: [], description: "", checkedIn: 0,
});
const ticket = (id: string, eventId: string, status: Ticket["status"] = "valid"): Ticket => ({
  id, code: `TKT-${id}`, eventId, tier: "General", price: 0, fee: 0, holder: "Me", status,
});

function mount(events: NaadaEvent[], tickets: Ticket[]) {
  return render(
    <MemoryRouter>
      <AppStoreProvider seed={{ events, tickets }}>
        <AuthSheetProvider>
          <MyTicketsScreen />
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("My tickets", () => {
  const events = [
    event("e-future", "Next Friday", daysFromNow(5)),
    event("e-tonight", "Tonight's Set", daysFromNow(0)),
    event("e-lastnight", "Late Show", daysFromNow(-1)),
    event("e-old", "Last Month", daysFromNow(-30)),
  ];
  const tickets = [ticket("1", "e-future"), ticket("2", "e-tonight"), ticket("3", "e-lastnight"), ticket("4", "e-old")];

  it("keeps tonight's, and a late show that ran past midnight, under Upcoming", () => {
    mount(events, tickets);
    expect(screen.getByText("Next Friday")).toBeInTheDocument();
    expect(screen.getByText("Tonight's Set")).toBeInTheDocument();
    expect(screen.getByText("Late Show")).toBeInTheDocument();
    expect(screen.queryByText("Last Month")).not.toBeInTheDocument();
  });

  it("moves a gig that has long gone to Past, even though nothing marked it completed", async () => {
    mount(events, tickets);
    await userEvent.click(screen.getByRole("tab", { name: "past" }));
    expect(screen.getByText("Last Month")).toBeInTheDocument();
    expect(screen.queryByText("Next Friday")).not.toBeInTheDocument();
  });

  it("a scanned ticket moves to Past straight away", async () => {
    mount(events, [ticket("1", "e-future", "checked_in")]);
    expect(screen.queryByText("Next Friday")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "past" }));
    expect(screen.getByText("Next Friday")).toBeInTheDocument();
  });
});
