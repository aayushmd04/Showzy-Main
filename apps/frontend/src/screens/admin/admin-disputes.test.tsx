import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as fixtures from "@/data/fixtures";
import * as api from "@/lib/api";
import { AdminDisputesScreen } from "./admin-disputes";

/**
 * The screen reads the live queue rather than the in-memory fixtures it used
 * to, so the API layer is what gets faked here. Everything else in the module
 * (ApiError, tokens, API_BASE) stays real — the store imports it too.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, get: vi.fn(), post: vi.fn() };
});

/**
 * Shaped to what `DisputeSerializer` actually sends
 * (apps/backend/apps/bookings/serializers.py), which is not what this screen
 * used to expect. The fixture previously followed the frontend's own declared
 * interface instead, so the test passed against a contract the server never
 * honoured and both real bugs went unseen:
 *
 *   * `raised_by` is a bare UUID, not `{ id, full_name, email }`. Reading
 *     `.full_name` off a string is `undefined`, so every dispute rendered
 *     "Raised by" followed by nothing. The serializer now also sends
 *     `raised_by_name` alongside the existing `raised_by_email`.
 *   * `created_at` is a full ISO-8601 datetime, and the date formatters threw
 *     on one — taking the entire screen down to the error boundary as soon as
 *     a single real dispute existed.
 */
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

const dispute = (over: Partial<ApiDispute> = {}): ApiDispute => ({
  id: "d1",
  booking_order: "bo-1",
  raised_by: "11111111-2222-3333-4444-555555555555",
  raised_by_name: "Tarana Collective",
  raised_by_email: "book@tarana.in",
  reason: "The artist arrived 40 minutes late and cut the second set short.",
  resolution: "pending",
  admin_notes: "",
  created_at: "2026-03-04T10:30:00Z",
  ...over,
});

type ApiDispute = {
  id: string;
  booking_order: string;
  raised_by: string | null;
  raised_by_name: string | null;
  raised_by_email: string | null;
  reason: string;
  resolution: "pending" | "release" | "refund" | "split";
  admin_notes: string;
  created_at: string;
  resolved_at?: string;
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/admin/disputes"]}>
      <AppStoreProvider seed={fixtureSeed()}>
        <AdminDisputesScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

/** Open the resolve dialog for the first queued dispute. */
async function openResolveDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Resolve" }));
  return screen.getByRole("dialog", { name: "Resolve dispute" });
}

describe("AdminDisputesScreen", () => {
  const get = vi.mocked(api.get);
  const post = vi.mocked(api.post);

  beforeEach(() => {
    get.mockReset();
    post.mockReset();
    // The queue endpoint only ever returns pending disputes, so a resolved one
    // simply leaves the list on the next fetch.
    get.mockResolvedValueOnce({ results: [dispute()] } as never);
    get.mockResolvedValue({ results: [] } as never);
    post.mockResolvedValue({} as never);
  });

  it("lists each queued dispute with who raised it and why", async () => {
    renderScreen();

    expect(await screen.findByText(/Tarana Collective/)).toBeInTheDocument();
    expect(screen.getByText(/40 minutes late/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith("/admin/disputes/");
  });

  it("releases funds to the artist with the admin's note and drops the dispute from the queue", async () => {
    const user = userEvent.setup();
    renderScreen();

    const dialog = await openResolveDialog(user);
    await user.type(within(dialog).getByLabelText("Resolution note"), "Reviewed both sides.");
    await user.click(within(dialog).getByRole("button", { name: "Release to artist" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/disputes/d1/resolve/", {
        resolution: "release",
        admin_notes: "Reviewed both sides.",
      }),
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText(/No open disputes\./i)).toBeInTheDocument();
  });

  it("refunds the host and falls back to a default note when the admin leaves it blank", async () => {
    const user = userEvent.setup();
    renderScreen();

    const dialog = await openResolveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Refund host" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/admin/disputes/d1/resolve/", {
        resolution: "refund",
        admin_notes: "Resolved by admin.",
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("keeps the dialog open so the admin can retry when the resolve call fails", async () => {
    const user = userEvent.setup();
    post.mockRejectedValue(new api.ApiError(500, "Server error"));
    renderScreen();

    const dialog = await openResolveDialog(user);
    await user.click(within(dialog).getByRole("button", { name: "Release to artist" }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("dialog", { name: "Resolve dispute" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("dialog", { name: "Resolve dispute" })).getByRole("button", {
        name: "Release to artist",
      }),
    ).toBeEnabled();
  });

  it("shows the empty state rather than a broken list when the queue call fails", async () => {
    get.mockReset();
    get.mockRejectedValue(new api.ApiError(503, "Service unavailable"));
    renderScreen();

    expect(await screen.findByText(/No open disputes\./i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });
});

describe("AdminDisputesScreen — the server's real shape", () => {
  const get = vi.mocked(api.get);

  beforeEach(() => {
    get.mockReset();
  });

  it("names the raiser from the flat field, not a nested object", async () => {
    get.mockResolvedValue({ results: [dispute()] } as never);
    renderScreen();
    expect(await screen.findByText(/Tarana Collective/)).toBeInTheDocument();
  });

  it("renders a full ISO timestamp without taking the screen down", async () => {
    get.mockResolvedValue({ results: [dispute({ created_at: "2026-03-04T10:30:00Z" })] } as never);
    renderScreen();
    // The date formatters used to throw on a datetime; if they still did, the
    // error boundary would swallow the list and this would never appear.
    expect(await screen.findByText(/04 Mar/)).toBeInTheDocument();
  });

  it("falls back to the email when the account has been erased", async () => {
    // A user exercising their right to erasure keeps the dispute row but loses
    // the name. "Raised by" followed by a blank helps nobody.
    get.mockResolvedValue({ results: [dispute({ raised_by_name: "" })] } as never);
    renderScreen();
    expect(await screen.findByText(/book@tarana\.in/)).toBeInTheDocument();
  });
});
