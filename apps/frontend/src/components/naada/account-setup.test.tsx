import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import * as api from "@/lib/api";
import { AccountSetupProvider, SetupBanner, useAccountSetup } from "./account-setup";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getAccountSetup: vi.fn(),
  getCities: vi.fn().mockResolvedValue([{ id: 2, name: "Mysuru", slug: "mysuru" }]),
  getGenres: vi.fn().mockResolvedValue([{ id: 5, name: "Carnatic Fusion", slug: "carnatic" }]),
  updateMe: vi.fn(),
  createVenue: vi.fn(),
  getMyArtistProfile: vi.fn(),
  updateArtist: vi.fn(),
  recordConsent: vi.fn().mockResolvedValue(undefined),
}));

const HOST_NO_VENUE: api.AccountSetup = {
  role: "venue_owner",
  complete: false,
  needs_attention: true,
  steps: [
    { key: "name", label: "your name", blocking: false },
    { key: "venue", label: "your venue's name, address, city and capacity", blocking: true },
  ],
};
const COMPLETE: api.AccountSetup = { role: "venue_owner", complete: true, needs_attention: false, steps: [] };

function As({ role, name = "" }: { role: "host" | "artist" | "listener"; name?: string }) {
  const { setRole, setCurrentUser } = useStore();
  useEffect(() => {
    setRole(role);
    setCurrentUser({ id: "u1", email: "a@x.in", full_name: name, role: role === "host" ? "venue_owner" : role });
  }, [role, name, setRole, setCurrentUser]);
  return null;
}

function Opener() {
  const { open } = useAccountSetup();
  return <button onClick={open}>Add your venue</button>;
}

function mount(role: "host" | "artist" | "listener", name = "") {
  return render(
    <MemoryRouter>
      <AppStoreProvider>
        <AccountSetupProvider>
          <As role={role} name={name} />
          <SetupBanner />
          <Opener />
        </AccountSetupProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Account setup for older accounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(api.getCities).mockResolvedValue([{ id: 2, name: "Mysuru", slug: "mysuru" }] as never);
    vi.mocked(api.getGenres).mockResolvedValue([{ id: 5, name: "Carnatic Fusion", slug: "carnatic" }] as never);
    vi.mocked(api.recordConsent).mockResolvedValue(undefined as never);
  });

  it("opens the venue form by itself for a host who has no venue, and says why", async () => {
    vi.mocked(api.getAccountSetup).mockResolvedValue(HOST_NO_VENUE);
    mount("host");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Add your venue");
    expect(dialog).toHaveTextContent(/made before we asked where your venue is/i);
    expect(screen.getByLabelText("Venue name")).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
  });

  it("keeps a banner on the console after 'Not now', and asks only once per visit", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAccountSetup).mockResolvedValue(HOST_NO_VENUE);
    mount("host");
    await user.click(await screen.findByRole("button", { name: "Not now" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Finish setting up your account");
    expect(banner).toHaveTextContent(/venue's name, address, city and capacity/);
    // ...and the banner button brings the form back.
    await user.click(screen.getByRole("button", { name: "Finish setup" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("saves the venue, then the prompt and the banner go away", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAccountSetup).mockResolvedValueOnce(HOST_NO_VENUE).mockResolvedValue(COMPLETE);
    vi.mocked(api.updateMe).mockResolvedValue({ id: "u1", email: "a@x.in", full_name: "Hema Rao", role: "venue_owner" } as never);
    vi.mocked(api.createVenue).mockResolvedValue({ id: "v1", name: "My Room" } as never);
    mount("host");
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText("Your name"), "Hema Rao");
    await user.type(screen.getByLabelText("Venue name"), "My Room");
    await user.type(screen.getByLabelText("Address"), "12, 4th Main");
    await user.selectOptions(screen.getByLabelText("City"), "Mysuru");
    await user.type(screen.getByLabelText("Capacity"), "80");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Finish setting up" }));

    await waitFor(() =>
      expect(api.createVenue).toHaveBeenCalledWith({ name: "My Room", address_line1: "12, 4th Main", city: "2", capacity: 80 }),
    );
    expect(api.updateMe).toHaveBeenCalledWith({ full_name: "Hema Rao" });
    expect(api.recordConsent).toHaveBeenCalledWith("organiser_terms", expect.any(String), "setup");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText("Finish setting up your account")).not.toBeInTheDocument());
  });

  it("shows what went wrong and keeps the form when saving fails", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getAccountSetup).mockResolvedValue(HOST_NO_VENUE);
    vi.mocked(api.updateMe).mockResolvedValue({ id: "u1", email: "a@x.in", full_name: "Hema", role: "venue_owner" } as never);
    vi.mocked(api.createVenue).mockRejectedValue(new api.ApiError(400, "That venue name is taken."));
    mount("host", "Hema");
    await screen.findByRole("dialog");
    // The name is already filled in from the account; the dialog's focus trap settles first.
    expect((screen.getByLabelText("Your name") as HTMLInputElement).value).toBe("Hema");
    await user.click(screen.getByLabelText("Venue name"));
    await user.type(screen.getByLabelText("Venue name"), "My Room");
    await user.type(screen.getByLabelText("Address"), "12, 4th Main");
    await user.selectOptions(screen.getByLabelText("City"), "Mysuru");
    await user.type(screen.getByLabelText("Capacity"), "80");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Finish setting up" }));
    await waitFor(() => expect(api.createVenue).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toHaveTextContent("That venue name is taken.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("asks an artist with a thin profile for city, genres and bio, prefilled with what they have", async () => {
    vi.mocked(api.getAccountSetup).mockResolvedValue({
      role: "artist", complete: false, needs_attention: true,
      steps: [{ key: "artist", label: "your city, your genres and a short bio", blocking: true }],
    });
    vi.mocked(api.getMyArtistProfile).mockResolvedValue({ id: "a1", stage_name: "Divya Nair", bio: "", genres: [] } as never);
    mount("artist", "Divya");
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Finish your artist profile");
    await waitFor(() => expect(screen.getByLabelText("Stage / performing name")).toHaveValue("Divya Nair"));
    expect(screen.getByLabelText("Your name")).toHaveValue("Divya");
  });

  it("never interrupts a fan, and never blocks for something optional", async () => {
    vi.mocked(api.getAccountSetup).mockResolvedValue({
      role: "attendee", complete: false, needs_attention: false, steps: [{ key: "name", label: "your name", blocking: false }],
    });
    mount("listener");
    await waitFor(() => expect(api.getAccountSetup).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows only a quiet banner, not a pop-up, for what is optional", async () => {
    vi.mocked(api.getAccountSetup).mockResolvedValue({
      role: "venue_owner", complete: false, needs_attention: false,
      steps: [{ key: "venue_capacity", label: "how many people your room holds", blocking: false }],
    });
    mount("host");
    expect(await screen.findByRole("status")).toHaveTextContent("A little more would help");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not nag when the setup check itself fails", async () => {
    vi.mocked(api.getAccountSetup).mockRejectedValue(new TypeError("offline"));
    mount("host");
    await waitFor(() => expect(api.getAccountSetup).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
