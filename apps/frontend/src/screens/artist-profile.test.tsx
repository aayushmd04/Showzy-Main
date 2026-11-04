import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { BriefComposerProvider } from "@/components/naada/brief-composer";
import { API_BASE } from "@/lib/api";
import * as artistData from "./artist/artist-data";
import type { NaadaEvent } from "@/data/fixtures";
import { ArtistProfileScreen } from "./artist-profile";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
  getMyEvents: vi.fn().mockResolvedValue({ results: [] }),
}));
vi.mock("./artist/artist-data", async (orig) => ({
  ...(await orig<typeof import("./artist/artist-data")>()),
  loadArtist: vi.fn(),
}));

const API_ORIGIN = new URL(API_BASE).origin;

const PUBLIC = {
  id: "art-1",
  stage_name: "Divya Nair",
  bio: "Carnatic vocalist.",
  genres: [{ id: 5, name: "Carnatic Fusion" }, { id: 8, name: "Classical" }],
  city_name: "Mysuru",
  is_verified: false,
  is_following: false,
  follower_count: 3,
  instagram: "divyanairmusic",
  youtube: "",
  website: "",
  avg_rating: 0,
  user: { id: "u-artist", full_name: "Divya Nair" },
  // A seeded picture the API reports on its own host; the files live on the website.
  primary_photo: `${API_ORIGIN}/media/artists/tanpura-vocalist.jpg`,
  photos: [
    { id: 1, image: `${API_ORIGIN}/media/artists/tanpura-vocalist.jpg`, caption: "Divya", is_primary: true, sort_order: 0 },
    { id: 2, image: `${API_ORIGIN}/media/artists/guitarist-stage-light.jpg`, caption: "On stage", is_primary: false, sort_order: 0 },
  ],
};
const BUSINESS = {
  fee_range_min: "4000.00",
  fee_range_max: "15000.00",
  total_gigs: 7,
  availability: { blackout_dates: ["2026-12-01"], notes: "Away in December" },
};

const past: NaadaEvent = {
  id: "e-past", name: "Old Night", venueId: "v1", hostId: "h", date: "2020-01-01", time: "19:00",
  status: "completed", genres: [], lineup: ["art-1"], tiers: [], description: "", checkedIn: 0,
};
const soon: NaadaEvent = { ...past, id: "e-soon", name: "Next Friday", date: "2099-01-01", status: "published" };

function As({ role, id }: { role: "out" | "listener" | "artist" | "host"; id?: string }) {
  const { setRole, setCurrentUser } = useStore();
  useEffect(() => {
    setRole(role);
    if (role !== "out") setCurrentUser({ id: id ?? "u-someone", email: "x@x.in", full_name: "Viewer", role });
  }, [role, id, setRole, setCurrentUser]);
  return null;
}

function open(role: "out" | "listener" | "artist" | "host", payload: object, id?: string) {
  vi.mocked(artistData.loadArtist).mockResolvedValue(payload as artistData.ArtistDetail);
  return render(
    <MemoryRouter initialEntries={["/a/art-1"]}>
      <AppStoreProvider seed={{ events: [past, soon] }}>
        <AuthSheetProvider>
          <BriefComposerProvider>
            <As role={role} id={id} />
            <Routes>
              <Route path="/a/:id" element={<ArtistProfileScreen />} />
            </Routes>
          </BriefComposerProvider>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Artist profile — who sees what", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows a signed-out visitor the artist, never the fee, calendar or gig history", async () => {
    open("out", PUBLIC);
    expect(await screen.findByRole("heading", { level: 1, name: /Divya Nair/i })).toBeInTheDocument();
    expect(screen.getByText("Carnatic vocalist.")).toBeInTheDocument();
    expect(screen.getByText("Next Friday")).toBeInTheDocument(); // shows they can attend are public
    for (const hidden of [/Booking fee/i, /Availability/i, /Past gigs/i, /gigs on Showzy/i, /Visible to hosts/i, /₹4,000/]) {
      expect(screen.queryByText(hidden)).not.toBeInTheDocument();
    }
  });

  it("keeps the fee and calendar from the audience and from another artist even if the server sent them", async () => {
    for (const role of ["listener", "artist"] as const) {
      const { unmount } = open(role, { ...PUBLIC, ...BUSINESS });
      await screen.findByRole("heading", { level: 1, name: /Divya Nair/i });
      expect(screen.queryByText(/Booking fee/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Availability/i)).not.toBeInTheDocument();
      expect(screen.queryByText("Away in December")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("gives artists and hosts the gig history, but not the audience", async () => {
    open("artist", { ...PUBLIC, ...BUSINESS });
    expect(await screen.findByText("Past gigs")).toBeInTheDocument();
    expect(screen.getByText(/7 gigs on Showzy/)).toBeInTheDocument();
  });

  it("shows a host the fee range and calendar, marked as for hosts only", async () => {
    open("host", { ...PUBLIC, ...BUSINESS });
    expect(await screen.findByText("Booking fee")).toBeInTheDocument();
    expect(screen.getByText("₹4,000–₹15,000")).toBeInTheDocument();
    expect(screen.getByText("Away in December")).toBeInTheDocument();
    expect(screen.getByText("Visible to hosts only")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Book this artist" })).toBeInTheDocument();
  });

  it("shows a host nothing the server did not send", async () => {
    open("host", PUBLIC); // e.g. a stale response from before they signed in
    await screen.findByRole("heading", { level: 1, name: /Divya Nair/i });
    expect(screen.queryByText("Booking fee")).not.toBeInTheDocument();
  });

  it("shows the artist their own page with a note that hosts see the fee", async () => {
    open("artist", { ...PUBLIC, ...BUSINESS }, "u-artist");
    expect(await screen.findByText("Only hosts see this")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit your profile" })).toBeInTheDocument();
  });

  it("points seeded photos at the website, not the API host that doesn't have them", async () => {
    const { container } = open("out", PUBLIC);
    await screen.findByRole("heading", { level: 1, name: /Divya Nair/i });
    await waitFor(() => expect(container.querySelectorAll("img").length).toBeGreaterThan(1));
    const sources = Array.from(container.querySelectorAll("img")).map((i) => i.getAttribute("src"));
    expect(sources).toContain("/media/artists/tanpura-vocalist.jpg");
    expect(sources).toContain("/media/artists/guitarist-stage-light.jpg");
    expect(sources.some((s) => s?.startsWith(API_ORIGIN))).toBe(false);
  });
});
