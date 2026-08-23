import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { AdminDisputesScreen } from "./admin-disputes";

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/admin/disputes"]}>
      <AppStoreProvider>
        <AdminDisputesScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("AdminDisputesScreen", () => {
  it("lists the fixture's open dispute with its reason", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByText(/Tarana Collective/)).toBeInTheDocument();
    expect(screen.getByText(/40 minutes late/)).toBeInTheDocument();
  });

  it("moves a booking from Open to Resolved when released", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    const dialog = screen.getByRole("dialog", { name: "Resolve dispute" });
    await user.type(within(dialog).getByLabelText("Resolution note"), "Reviewed both sides.");
    await user.click(within(dialog).getByRole("button", { name: "Release to artist" }));

    // Dialog closes and the booking no longer appears under Open …
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(
      screen.getByText(/No open disputes\./i, { exact: false }),
    ).toBeInTheDocument();

    // … but shows up under Resolved with the outcome and note.
    // Pill renders its label upper-cased.
    expect(screen.getByRole("heading", { name: "Resolved" })).toBeInTheDocument();
    expect(screen.getByText("RELEASED")).toBeInTheDocument();
    expect(screen.getByText("Reviewed both sides.")).toBeInTheDocument();
  });

  it("moves a booking from Open to Resolved when refunded", async () => {
    const user = userEvent.setup();
    renderScreen();

    await user.click(screen.getByRole("button", { name: "Resolve" }));
    const dialog = screen.getByRole("dialog", { name: "Resolve dispute" });
    await user.click(within(dialog).getByRole("button", { name: "Refund host" }));

    await waitFor(() => expect(screen.getByText("REFUNDED")).toBeInTheDocument());
  });
});
