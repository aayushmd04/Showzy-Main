import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as fixtures from "@/data/fixtures";
import * as api from "@/lib/api";
import { ArtistGigBoardScreen } from "./artist-gig-board";

/**
 * Applying posts to the gig-applications endpoint before the board updates, so
 * without a stub the submit hits the network, rejects, and the modal correctly
 * stays open. Fake the call, not the assertion.
 */
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, applyToGig: vi.fn() };
});

/*
 * The fixtures were written against a frozen "today" of 2026-08-20, and the
 * gig board only lists gigs that haven't happened yet. Once the real calendar
 * moved past those dates the board was correctly empty and every assertion
 * here failed — so rebase the fixture dates onto the current week, keeping the
 * gaps between them intact. Without this the suite passes only during the one
 * week the fixtures were authored in.
 */
const FIXTURE_TODAY = "2026-08-20";

function shiftToNow(iso: string): string {
  const from = new Date(FIXTURE_TODAY + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const offsetDays = Math.round((now.getTime() - from.getTime()) / 86_400_000);

  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + offsetDays);
  return (
    `${d.getFullYear()}-` +
    `${String(d.getMonth() + 1).padStart(2, "0")}-` +
    `${String(d.getDate()).padStart(2, "0")}`
  );
}

/*
 * The store starts empty in the app, so a screen test that asserts on fixture
 * content has to put it there deliberately.
 */
const fixtureSeed = () => ({
  events: fixtures.events.map((e) => ({
    ...e,
    date: shiftToNow(e.date),
    tiers: e.tiers.map((t) => ({ ...t })),
  })),
  artists: fixtures.artists.map((a) => ({ ...a })),
  venues: fixtures.venues.map((v) => ({ ...v })),
  bookings: fixtures.bookings.map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q })) })),
  tickets: fixtures.tickets.map((t) => ({ ...t })),
  settlements: fixtures.settlements.map((s) => ({ ...s })),
  messages: fixtures.messages.map((m) => ({ ...m })),
  applications: fixtures.gigApplications.map((a) => ({ ...a })),
  reviews: fixtures.reviews.map((r) => ({ ...r })),
});

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/artist/gig-board"]}>
      <AppStoreProvider seed={fixtureSeed()}>
        <ArtistGigBoardScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("ArtistGigBoardScreen", () => {
  const applyToGig = vi.mocked(api.applyToGig);

  beforeEach(() => {
    applyToGig.mockReset();
    applyToGig.mockResolvedValue({});
  });

  it("lists the fixture's open slot", () => {
    renderScreen();
    expect(screen.getByText("Fuzz & Filter Coffee")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply" })).toBeInTheDocument();
  });

  it("submits an application and shows the applied status instead of the Apply button", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Send application" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText("APPLIED")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply" })).not.toBeInTheDocument();
  });

  it("sends the event, the artist's note and the proposed rate to the gig-applications endpoint", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    const rate = screen.getByLabelText("Your rate");
    await user.clear(rate);
    await user.type(rate, "12000");
    await user.click(screen.getByRole("button", { name: "Send application" }));

    await waitFor(() =>
      expect(api.applyToGig).toHaveBeenCalledWith(
        // The view reads event / note / proposed_fee — posting event_id made
        // every application 404.
        expect.objectContaining({ event: "e2", proposed_fee: 12000 }),
      ),
    );
  });

  it("keeps the modal open and does not mark the gig applied when the submission is rejected", async () => {
    const user = userEvent.setup();
    applyToGig.mockRejectedValue(new api.ApiError(400, "You have already applied to this gig."));
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Apply" }));
    await user.click(screen.getByRole("button", { name: "Send application" }));

    await waitFor(() => expect(api.applyToGig).toHaveBeenCalled());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send application" })).toBeEnabled();
    expect(screen.queryByText("APPLIED")).not.toBeInTheDocument();
  });
});
