import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import * as eventData from "@/components/naada/event-data";
import { EventScreen } from "./event";

// The shell's city picker asks the API for cities; keep the test off the network.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/components/naada/event-data", async (orig) => ({
  ...(await orig<typeof import("@/components/naada/event-data")>()),
  loadEventDetail: vi.fn(),
}));

const tier = (over: Record<string, unknown> = {}) => ({
  id: "tier-1",
  name: "General",
  name_kn: "",
  price: "500.00",
  total_quantity: 100,
  sold_quantity: 0,
  is_active: true,
  min_per_order: 1,
  max_per_order: 10,
  ...over,
});

const detail = (tiers: unknown[]) =>
  ({
    id: "ev1",
    title: "Friday Raga",
    title_kn: "",
    description: "",
    description_kn: "",
    venue: {
      id: "v1",
      name: "Gokulam Hall",
      area: "Vijayanagar",
      capacity: 120,
      address_line1: "12, 4th Main",
      city_name: "Mysuru",
      google_maps_url: "https://maps.app.goo.gl/abc",
    },
    start_datetime: "2099-01-10T19:00:00+05:30",
    end_datetime: "2099-01-10T22:00:00+05:30",
    status: "published",
    genres: [],
    ticket_tiers: tiers,
    is_featured: false,
    reviews: [],
    is_saved: false,
    organizer_name: "Meera",
  }) as unknown as eventData.EventDetail;

/** Signs in (so Get ticket goes straight to checkout) and shows what the checkout holds. */
function Probe() {
  const { setRole, checkout } = useStore();
  useEffect(() => setRole("listener"), [setRole]);
  return <p data-testid="draft">{`${checkout.tierName}|${checkout.qty}`}</p>;
}

function open(tiers: unknown[]) {
  vi.mocked(eventData.loadEventDetail).mockResolvedValue(detail(tiers));
  return render(
    <MemoryRouter initialEntries={["/e/ev1"]}>
      <AppStoreProvider>
        <AuthSheetProvider>
          <Probe />
          <Routes>
            <Route path="/e/:id" element={<EventScreen />} />
            <Route path="/checkout/pay" element={<p>CHECKOUT</p>} />
          </Routes>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

const more = () => screen.getByRole("button", { name: "More tickets" });
const fewer = () => screen.getByRole("button", { name: "Fewer tickets" });

describe("Event page ticket quantity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts at one ticket and prices the total as the buyer adds more", async () => {
    const user = userEvent.setup();
    open([tier()]);
    await screen.findByLabelText("1 ticket selected");
    await user.click(more());
    await user.click(more());
    expect(screen.getByLabelText("3 tickets selected")).toBeInTheDocument();
    expect(screen.getByText("Ticket × 3")).toBeInTheDocument();
    // 3 × ₹500 + 3 × ₹19 booking fee
    expect(screen.getAllByText("₹1,557").length).toBeGreaterThan(0);
  });

  it("lets a buyer take ten but no more", async () => {
    const user = userEvent.setup();
    open([tier()]);
    await screen.findByLabelText("1 ticket selected");
    for (let i = 0; i < 12; i++) if (!more().hasAttribute("disabled")) await user.click(more());
    expect(screen.getByLabelText("10 tickets selected")).toBeInTheDocument();
    expect(more()).toBeDisabled();
    expect(screen.getByText(/10 is the most one order can hold/)).toBeInTheDocument();
  });

  it("holds a tier's own lower limit and what is left", async () => {
    const user = userEvent.setup();
    open([tier({ max_per_order: 4 })]);
    await screen.findByLabelText("1 ticket selected");
    for (let i = 0; i < 6; i++) if (!more().hasAttribute("disabled")) await user.click(more());
    expect(screen.getByLabelText("4 tickets selected")).toBeInTheDocument();
  });

  it("cannot take more than the seats left", async () => {
    const user = userEvent.setup();
    open([tier({ total_quantity: 5, sold_quantity: 3 })]);
    await screen.findByLabelText("1 ticket selected");
    await user.click(more());
    expect(more()).toBeDisabled();
    expect(screen.getByLabelText("2 tickets selected")).toBeInTheDocument();
  });

  it("goes back to the tier's minimum when another tier is chosen", async () => {
    const user = userEvent.setup();
    open([tier(), tier({ id: "tier-2", name: "Pair", min_per_order: 2 })]);
    await screen.findByLabelText("1 ticket selected");
    await user.click(more());
    await user.click(more());
    await user.click(screen.getByRole("button", { name: /Pair/ }));
    expect(screen.getByLabelText("2 tickets selected")).toBeInTheDocument();
    expect(fewer()).toBeDisabled();
  });

  it("carries the chosen quantity into the checkout", async () => {
    const user = userEvent.setup();
    open([tier()]);
    await screen.findByLabelText("1 ticket selected");
    for (let i = 0; i < 5; i++) await user.click(more());
    await user.click(screen.getAllByRole("button", { name: "Get ticket" })[0]);
    await waitFor(() => expect(screen.getByText("CHECKOUT")).toBeInTheDocument());
    expect(screen.getByTestId("draft")).toHaveTextContent("General|6");
  });

  it("shows where the venue is, with a directions link from the host's Maps link", async () => {
    const { container } = open([tier()]);
    await screen.findByText("The venue");
    expect(screen.getByText(/12, 4th Main, Mysuru/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/abc",
    );
    expect(container.querySelector("iframe")).toBeNull();
  });
});
