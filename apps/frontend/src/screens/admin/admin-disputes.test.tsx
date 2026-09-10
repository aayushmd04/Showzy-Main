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
 * Shaped to `ApiDispute` in admin-disputes.tsx.
 *
 * FIXME(backend contract): the live endpoint does not match this on two
 * fields — `DisputeSerializer` (apps/backend/apps/bookings/serializers.py)
 * returns `raised_by` as a bare UUID plus a separate `raised_by_email`, and
 * `created_at` as a full ISO-8601 datetime. `dateCompact` throws on a datetime,
 * which takes the whole Open list down. Both are reported; neither is
 * something a test can decide, so the fixture follows the frontend's own
 * declared interface.
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
  raised_by: { id: "u1", full_name: "Tarana Collective", email: "book@tarana.in" },
  reason: "The artist arrived 40 minutes late and cut the second set short.",
  resolution: "pending",
  admin_notes: "",
  created_at: "2026-03-04",
  ...over,
});

type ApiDispute = {
  id: string;
  booking_order: string;
  raised_by: { id: string; full_name: string; email: string };
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
