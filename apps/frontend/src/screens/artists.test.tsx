import { useEffect } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import type { Artist } from "@/data/fixtures";
import { ArtistsScreen } from "./artists";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));

const artist = (id: string, name: string, genres: string[], photo?: string): Artist => ({
  id, name, genres, city: "Mysuru", feeMin: 4000, feeMax: 15000, gigsPlayed: 7, rating: 0, bio: "", photo, kycStatus: "pending",
});
const ARTISTS = [
  artist("a1", "Divya Nair", ["Carnatic Fusion"], "/media/artists/tanpura-vocalist.jpg"),
  artist("a2", "Ishaan M", ["Stand-up Comedy"]),
];

function As({ role }: { role: "out" | "listener" | "artist" | "host" }) {
  const { setRole } = useStore();
  useEffect(() => setRole(role), [role, setRole]);
  return null;
}

function open(role: "out" | "listener" | "artist" | "host", initial = "/artists") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <AppStoreProvider seed={{ artists: ARTISTS }}>
        <AuthSheetProvider>
          <As role={role} />
          <ArtistsScreen />
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Artists page", () => {
  it("lists every artist with a picture, and links to the profile", async () => {
    const { container } = open("out");
    expect(await screen.findByRole("heading", { name: "Divya Nair" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ishaan M" })).toBeInTheDocument();
    expect(container.querySelector('img[src="/media/artists/tanpura-vocalist.jpg"]')).not.toBeNull();
    expect(screen.getByRole("link", { name: /Divya Nair/ })).toHaveAttribute("href", "/a/a1");
    // One without a photo still gets a drawn avatar, not a blank.
    expect(screen.getByText("I")).toBeInTheDocument();
  });

  it.each(["out", "listener"] as const)("shows neither fees nor gig counts to a %s", async (role) => {
    open(role);
    await screen.findByRole("heading", { name: "Divya Nair" });
    expect(screen.queryByText(/₹4,000/)).not.toBeInTheDocument();
    expect(screen.queryByText(/7 gigs/)).not.toBeInTheDocument();
  });

  it("shows another artist gig counts but not fees", async () => {
    open("artist");
    await screen.findByRole("heading", { name: "Divya Nair" });
    expect(screen.getAllByText("7 gigs").length).toBeGreaterThan(0);
    expect(screen.queryByText(/₹4,000/)).not.toBeInTheDocument();
  });

  it("shows a host the fee range and gig counts", async () => {
    open("host");
    await screen.findByRole("heading", { name: "Divya Nair" });
    expect(screen.getAllByText("₹4,000–₹15,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("7 gigs").length).toBeGreaterThan(0);
  });

  it("filters by what is typed and by genre", async () => {
    const user = userEvent.setup();
    open("out");
    await screen.findByRole("heading", { name: "Divya Nair" });
    await user.type(screen.getByLabelText("Search artists or genres"), "comedy");
    expect(screen.queryByRole("heading", { name: "Divya Nair" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ishaan M" })).toBeInTheDocument();
  });

  it("opens straight onto a genre from a link", async () => {
    open("out", "/artists?genre=Carnatic%20Fusion");
    expect(await screen.findByRole("heading", { name: "Divya Nair" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Ishaan M" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Carnatic Fusion", pressed: true })).toBeInTheDocument();
  });
});
