import { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import * as fixtures from "@/data/fixtures";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import * as api from "@/lib/api";
import type { ApiEvent, ApiTicket } from "@/lib/api";
import { CheckoutPayScreen } from "./checkout-pay";

/**
 * This screen is where money changes hands. Everything it does is a call into
 * the API client, so that is what gets faked; ApiError and the token helpers
 * stay real because the store imports the same module.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAllEvents: vi.fn(),
    getAllArtists: vi.fn(),
    getAllVenues: vi.fn(),
    getMyTickets: vi.fn(),
    getMyOrders: vi.fn(),
    createTicketOrder: vi.fn(),
    initiatePayment: vi.fn(),
    completeMockPayment: vi.fn(),
    verifyPayment: vi.fn(),
    validatePromo: vi.fn(),
  };
});

/*
 * The store starts empty in the app, so a screen test that asserts on fixture
 * content has to put it there deliberately.
 */
const fixtureSeed = () => ({
  events: fixtures.events.map((e) => ({ ...e, tiers: e.tiers.map((t) => ({ ...t })) })),
  artists: fixtures.artists.map((a) => ({ ...a })),
  venues: fixtures.venues.map((v) => ({ ...v })),
  bookings: fixtures.bookings.map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q })) })),
  tickets: fixtures.tickets.map((t) => ({ ...t })),
  settlements: fixtures.settlements.map((s) => ({ ...s })),
  messages: fixtures.messages.map((m) => ({ ...m })),
  applications: fixtures.gigApplications.map((a) => ({ ...a })),
  reviews: fixtures.reviews.map((r) => ({ ...r })),
});

const TIER = {
  id: "tier-general",
  name: "General",
  name_kn: "",
  price: "499.00",
  total_quantity: 120,
  sold_quantity: 40,
  is_active: true,
};

function apiEvent(over: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: "ev-live-1",
    title: "Basement Tapes Vol. 4",
    title_kn: "",
    description: "Two sets, one long night.",
    description_kn: "",
    venue: { id: "vn-1", name: "The Humming Tree", area_name: "Indiranagar", capacity: 200 },
    start_datetime: "2026-09-19T20:00:00.000Z",
    end_datetime: "2026-09-19T23:00:00.000Z",
    status: "published",
    genres: [{ id: 1, name: "Indie", name_kn: "" }],
    ticket_tiers: [TIER],
    is_featured: false,
    ...over,
  };
}

/** Flat, exactly as TicketSerializer returns it — `event` is a bare UUID. */
const ISSUED_TICKET: ApiTicket = {
  id: "tk-1",
  order: "order-1",
  ticket_number: "SHOWZY-0001",
  qr_data: "qr",
  qr_image_url: "/qr.png",
  event: "ev-live-1",
  event_title: "Basement Tapes Vol. 4",
  event_date: "2026-09-19T20:00:00.000Z",
  venue_name: "The Humming Tree",
  tier_name: "General",
  tier_price: "0",
  holder_name: "Test Buyer",
  holder_email: "buyer@example.com",
  holder_phone: "",
  seat_label: null,
  status: "valid",
  checked_in_at: null,
  transfer_count: 0,
};

/**
 * The screen reads the event out of the store and the tier out of the
 * checkout draft, so a test has to hydrate before it can render. Hydrating is
 * also what gives a tier its server id — fixture tiers have none, which is a
 * case the screen has to handle and one test below covers.
 */
function Boot({
  tierName,
  qty = 1,
  hydrate = true,
  eventId = "ev-live-1",
}: {
  tierName: string;
  qty?: number;
  hydrate?: boolean;
  eventId?: string;
}) {
  const { hydrateFromApi, startCheckout, setRole } = useStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setRole("listener");
    const begin = () => {
      startCheckout(eventId, tierName, undefined, qty);
      setReady(true);
    };
    if (hydrate) void hydrateFromApi().then(begin);
    else begin();
    // Boot once — this stands in for the screens that navigate here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ready ? <CheckoutPayScreen /> : null;
}

function renderCheckout(props: Parameters<typeof Boot>[0]) {
  return render(
    <MemoryRouter initialEntries={["/checkout/pay"]}>
      <AppStoreProvider seed={fixtureSeed()}>
        <AuthSheetProvider>
          <Routes>
            <Route path="/checkout/pay" element={<Boot {...props} />} />
            <Route path="/ticket/:code" element={<p>Your ticket is ready</p>} />
            <Route path="/tickets" element={<p>My tickets</p>} />
            <Route path="/" element={<p>Home</p>} />
          </Routes>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("CheckoutPayScreen", () => {
  beforeEach(() => {
    vi.mocked(api.getAllEvents).mockResolvedValue([apiEvent()]);
    vi.mocked(api.getAllArtists).mockResolvedValue([]);
    vi.mocked(api.getAllVenues).mockResolvedValue([]);
    vi.mocked(api.getMyTickets).mockResolvedValue({ results: [ISSUED_TICKET] });
    vi.mocked(api.getMyOrders).mockResolvedValue({ results: [] });
    vi.mocked(api.createTicketOrder).mockResolvedValue({
      id: "order-1",
      status: "pending",
      subtotal: "499.00",
      discount_amount: "0.00",
      platform_fee: "0.00",
      taxes: "0.00",
      total_amount: "499.00",
      items: [],
      event: "ev-live-1",
    });
    vi.mocked(api.initiatePayment).mockResolvedValue({
      payment_id: "pay-1",
      order_id: "order-1",
      gateway: "mock",
      is_mock: true,
      gateway_order_id: "gw_order_1",
      amount: 49900,
      currency: "INR",
    });
    vi.mocked(api.completeMockPayment).mockResolvedValue({
      status: "success",
      gateway_order_id: "gw_order_1",
      gateway_payment_id: "gw_pay_1",
      gateway_signature: "sig-abc",
    });
    vi.mocked(api.verifyPayment).mockResolvedValue({ status: "paid", order_id: "order-1" });
  });

  it("reserves the order, opens payment and verifies the signature, in that order", async () => {
    const user = userEvent.setup();
    renderCheckout({ tierName: "General", qty: 2 });

    await user.click(await screen.findByRole("button", { name: "Pay ₹1,036" }));

    // The simulated gateway sheet stands in for Razorpay's.
    await user.click(await screen.findByRole("button", { name: "Approve payment" }));

    expect(await screen.findByText("Your ticket is ready")).toBeInTheDocument();

    expect(api.createTicketOrder).toHaveBeenCalledWith({
      event_id: "ev-live-1",
      items: [{ tier_id: "tier-general", quantity: 2 }],
      promo_code: undefined,
    });
    expect(api.initiatePayment).toHaveBeenCalledWith({ order_id: "order-1" });
    expect(api.completeMockPayment).toHaveBeenCalledWith({
      order_id: "order-1",
      gateway_order_id: "gw_order_1",
      outcome: "success",
    });
    expect(api.verifyPayment).toHaveBeenCalledWith({
      order_id: "order-1",
      gateway_order_id: "gw_order_1",
      gateway_payment_id: "gw_pay_1",
      gateway_signature: "sig-abc",
    });

    // Inventory must be held before a gateway is ever opened, and the
    // signature checked before the ticket is handed over.
    const order = (fn: unknown) =>
      (fn as { mock: { invocationCallOrder: number[] } }).mock.invocationCallOrder[0];
    expect(order(api.createTicketOrder)).toBeLessThan(order(api.initiatePayment));
    expect(order(api.initiatePayment)).toBeLessThan(order(api.completeMockPayment));
    expect(order(api.completeMockPayment)).toBeLessThan(order(api.verifyPayment));
  });

  it("confirms a free order without opening a gateway at all", async () => {
    vi.mocked(api.getAllEvents).mockResolvedValue([
      apiEvent({ ticket_tiers: [{ ...TIER, id: "tier-free", name: "Free entry", price: "0.00" }] }),
    ]);
    vi.mocked(api.initiatePayment).mockResolvedValue({
      payment_id: "pay-free",
      order_id: "order-free",
      gateway: "none",
      status: "success",
    });
    const user = userEvent.setup();
    renderCheckout({ tierName: "Free entry" });

    await user.click(await screen.findByRole("button", { name: "Reserve my spot" }));

    expect(await screen.findByText("Your ticket is ready")).toBeInTheDocument();
    expect(api.completeMockPayment).not.toHaveBeenCalled();
    expect(api.verifyPayment).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the decline reason and never verifies when the payment is refused", async () => {
    vi.mocked(api.completeMockPayment).mockResolvedValue({
      status: "failed",
      error: { code: "BAD_CARD", description: "Your bank declined the payment." },
    });
    const user = userEvent.setup();
    renderCheckout({ tierName: "General" });

    await user.click(await screen.findByRole("button", { name: "Pay ₹518" }));
    await user.click(await screen.findByRole("button", { name: "Decline payment" }));

    expect(
      await screen.findByRole("heading", { name: /Payment didn't go through/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your bank declined the payment.")).toBeInTheDocument();
    expect(api.verifyPayment).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("explains rather than throws when the tier has no server id to order against", async () => {
    const user = userEvent.setup();
    // Fixture event e2 "Fuzz & Filter Coffee" — its tiers were never created
    // server-side, so there is nothing to reserve.
    renderCheckout({ tierName: "General", hydrate: false, eventId: "e2" });

    await user.click(await screen.findByRole("button", { name: "Pay ₹518" }));

    expect(await screen.findByText(/couldn't find the ticket type/i)).toBeInTheDocument();
    expect(api.createTicketOrder).not.toHaveBeenCalled();
  });

  it("applies a validated promo code to the total and sends it with the order", async () => {
    vi.mocked(api.validatePromo).mockResolvedValue({
      valid: true,
      discount_type: "flat",
      discount_value: 100,
      discount_amount: 100,
      new_total: 399,
    });
    const user = userEvent.setup();
    renderCheckout({ tierName: "General" });

    await user.type(await screen.findByLabelText("Promo code"), "naada10");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByRole("button", { name: "Pay ₹418" })).toBeInTheDocument();
    expect(screen.getByText(/₹100/)).toBeInTheDocument();
    expect(api.validatePromo).toHaveBeenCalledWith({
      code: "NAADA10",
      event_id: "ev-live-1",
      order_amount: 499,
    });

    await user.click(screen.getByRole("button", { name: "Pay ₹418" }));

    await waitFor(() =>
      expect(api.createTicketOrder).toHaveBeenCalledWith(
        expect.objectContaining({ promo_code: "NAADA10" }),
      ),
    );
  });

  it("keeps the total intact and says why when the promo code is rejected", async () => {
    vi.mocked(api.validatePromo).mockResolvedValue({
      valid: false,
      detail: "That code has expired.",
    });
    const user = userEvent.setup();
    renderCheckout({ tierName: "General" });

    await user.type(await screen.findByLabelText("Promo code"), "expired");
    await user.click(screen.getByRole("button", { name: "Apply" }));

    expect(await screen.findByText("That code has expired.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pay ₹518" })).toBeInTheDocument();
  });
});
