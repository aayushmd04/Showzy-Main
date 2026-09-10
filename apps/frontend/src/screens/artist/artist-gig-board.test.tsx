import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
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

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/artist/gig-board"]}>
      <AppStoreProvider>
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
        expect.objectContaining({ event_id: "e2", proposed_rate: 12000 }),
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
