import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { ArtistGigBoardScreen } from "./artist-gig-board";

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
});
