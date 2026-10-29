import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import * as csv from "@/lib/csv";
import { HostSettlementsScreen } from "./host-settlements";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getHostPayoutStatement: vi.fn(),
  getMyOrders: vi.fn().mockResolvedValue({ results: [] }),
  getOrderLedger: vi.fn(),
  getCities: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/csv", async (orig) => ({
  ...(await orig<typeof import("@/lib/csv")>()),
  downloadCsv: vi.fn(),
}));

const money = (collected: string, over: Partial<api.ApiPayoutSummary> = {}): api.ApiPayoutSummary => ({
  collected,
  refunded: "0.00",
  naada_fee: "50.00",
  owed_to_organiser: "950.00",
  paid_out: "0.00",
  balance: "950.00",
  ...over,
});

const night = (over: Partial<api.ApiStatementEvent> = {}): api.ApiStatementEvent => ({
  event_id: "e1",
  title: "Friday Raga",
  start_datetime: "2026-11-20T19:00:00+05:30",
  status: "published",
  tickets_sold: 40,
  payouts: [],
  ...money("1000.00"),
  ...over,
});

const ready: api.ApiPayoutAccount = { ready: true, blocker: "", account_last4: "9012", account_holder: "Gokulam Hall" };

const statement = (over: Partial<api.ApiPayoutStatement> = {}): api.ApiPayoutStatement => ({
  totals: money("1000.00"),
  events: [night()],
  payout_account: ready,
  ...over,
});

function open() {
  return render(
    <MemoryRouter>
      <AppStoreProvider>
        <HostSettlementsScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Settlements — ticket sales statement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getMyOrders).mockResolvedValue({ results: [] });
  });

  it("shows what came in, what Showzy kept and what is still owed, per night and in total", async () => {
    vi.mocked(api.getHostPayoutStatement).mockResolvedValue(statement());
    open();
    expect(await screen.findByText("Friday Raga")).toBeInTheDocument();
    const totals = screen.getByText("Still owed", { selector: "dt" }).closest("div")!;
    expect(within(totals).getByText("₹950")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument(); // tickets sold
    expect(screen.getByText(/bank account ending/)).toHaveTextContent("9012");
  });

  it("lists each payment with its bank reference when asked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getHostPayoutStatement).mockResolvedValue(
      statement({
        events: [
          night({
            ...money("1000.00", { paid_out: "400.00", balance: "550.00" }),
            payouts: [{ id: "p1", amount: "400.00", reference: "UTR123456", paid_at: "2026-11-22T10:00:00Z", note: "First instalment" }],
          }),
        ],
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: /Show 1 payment/ }));
    expect(screen.getByText("UTR123456")).toBeInTheDocument();
    expect(screen.getByText(/First instalment/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Hide 1 payment/ }));
    expect(screen.queryByText("UTR123456")).not.toBeInTheDocument();
  });

  it.each([
    ["no_bank_details", /Add your bank account/],
    ["kyc_pending", /verification/],
    ["kyc_rejected", /rejected/],
    ["no_venue", /Add your venue/],
  ] as const)("tells the host why they can't be paid yet (%s) and where to fix it", async (blocker, message) => {
    vi.mocked(api.getHostPayoutStatement).mockResolvedValue(
      statement({ payout_account: { ready: false, blocker, account_last4: "", account_holder: "" } }),
    );
    open();
    expect(await screen.findByRole("status")).toHaveTextContent(message);
    expect(screen.getByRole("link", { name: /Business & payouts/ })).toHaveAttribute("href", "/host/business");
  });

  it("explains an empty statement instead of showing an empty table", async () => {
    vi.mocked(api.getHostPayoutStatement).mockResolvedValue(
      statement({ events: [], totals: money("0.00", { naada_fee: "0.00", owed_to_organiser: "0.00", balance: "0.00" }) }),
    );
    open();
    expect(await screen.findByText(/No ticket sales yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Download statement/ })).not.toBeInTheDocument();
  });

  it("says so, with a retry, when the statement cannot load", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getHostPayoutStatement)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(statement());
    open();
    expect(await screen.findByText(/Couldn't reach Showzy/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Friday Raga")).toBeInTheDocument();
  });

  it("downloads the statement as a spreadsheet with a totals row and the payments", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getHostPayoutStatement).mockResolvedValue(
      statement({
        events: [
          night({
            ...money("1000.00", { paid_out: "400.00", balance: "550.00" }),
            payouts: [{ id: "p1", amount: "400.00", reference: "UTR123456", paid_at: "2026-11-22T10:00:00Z", note: "" }],
          }),
        ],
      }),
    );
    open();
    await user.click(await screen.findByRole("button", { name: /Download statement/ }));

    await waitFor(() => expect(csv.downloadCsv).toHaveBeenCalledTimes(1));
    const [name, rows] = vi.mocked(csv.downloadCsv).mock.calls[0];
    expect(name).toBe("showzy-ticket-sales.csv");
    expect(rows[0]).toContain("Still owed");
    expect(rows[1]).toEqual(["Friday Raga", "2026-11-20", 40, 1000, 0, 50, 950, 400, 550]);
    expect(rows.some((r) => r[0] === "Total")).toBe(true);
    expect(rows.some((r) => r.includes("UTR123456"))).toBe(true);
  });
});
