import { useEffect } from "react";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";
import { ExploreScreen } from "./explore";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));

const venues: Venue[] = [
  { id: "v1", slug: "loft", name: "Koramangala Loft", area: "Koramangala", capacity: 110 },
  { id: "v2", slug: "hall", name: "The Old Cinema Hall", area: "VV Mohalla", capacity: 180 },
];
const artists: Artist[] = [
  { id: "a1", name: "Late Bloom Improv", genres: ["Improv"], city: "Bengaluru", feeMin: 0, feeMax: 0, gigsPlayed: 0, rating: 0, bio: "", kycStatus: "pending" },
  { id: "a2", name: "Rangamanch Mysuru", genres: ["Theatre", "Street Play"], city: "Mysuru", feeMin: 0, feeMax: 0, gigsPlayed: 0, rating: 0, bio: "", kycStatus: "pending" },
];
const event = (id: string, name: string, venueId: string, genres: string[], over: Partial<NaadaEvent> = {}): NaadaEvent => ({
  id, name, venueId, hostId: "h", date: "2099-03-01", time: "19:00", status: "published",
  genres, lineup: [], tiers: [{ name: "General", price: 200, capacity: 50, sold: 0 }], description: "", checkedIn: 0, ...over,
});
const events = [
  event("e1", "Improv Jam: Open Stage", "v1", ["Improv"]),
  event("e2", "Improv for Beginners", "v1", ["Improv"]),
  event("e3", "A New Play", "v2", ["Theatre"]),
  event("e4", "Street Play Festival", "v2", ["Street Play"]),
  event("e5", "Old Improv Night", "v1", ["Improv"], { date: "2020-01-01" }),
  event("e6", "Draft Improv", "v1", ["Improv"], { status: "draft" }),
];

function As({ role }: { role: "out" | "artist" | "host" }) {
  const { setRole } = useStore();
  useEffect(() => setRole(role), [role, setRole]);
  return null;
}

function open(url: string, role: "out" | "artist" | "host" = "out") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppStoreProvider seed={{ events, artists, venues }}>
        <AuthSheetProvider>
          <As role={role} />
          <ExploreScreen />
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Explore — one art form from all three sides", () => {
  it("a genre page lists its upcoming nights, never past or draft ones", async () => {
    open("/explore?genre=Improv");
    expect(await screen.findByRole("heading", { level: 1, name: /Improv/i })).toBeInTheDocument();
    expect(screen.getAllByText("Improv Jam: Open Stage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Improv for Beginners").length).toBeGreaterThan(0);
    expect(screen.queryByText("A New Play")).not.toBeInTheDocument();
    expect(screen.queryByText("Old Improv Night")).not.toBeInTheDocument();
    expect(screen.queryByText("Draft Improv")).not.toBeInTheDocument();
    expect(screen.getByText(/2 nights coming up · 1 artist · 1 room/)).toBeInTheDocument();
  });

  it("shows the artists who do it and the rooms that host it, each a link to its own page", async () => {
    open("/explore?genre=Improv");
    const artists = await screen.findByRole("region", { name: /Artists in improv/i });
    expect(within(artists).getByRole("link", { name: /Late Bloom Improv/ })).toHaveAttribute("href", "/a/a1");
    const rooms = screen.getByRole("region", { name: /Rooms hosting improv/i });
    expect(within(rooms).getByRole("link", { name: /Koramangala Loft/ })).toHaveAttribute("href", "/v/loft");
    expect(within(rooms).queryByText("The Old Cinema Hall")).not.toBeInTheDocument();
  });

  it("a category page gathers its genres and links to each", async () => {
    open("/explore?category=drama");
    expect(await screen.findByRole("heading", { level: 1, name: /Drama/i })).toBeInTheDocument();
    expect(screen.getAllByText("A New Play").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Street Play Festival").length).toBeGreaterThan(0);
    expect(screen.queryByText("Improv Jam: Open Stage")).not.toBeInTheDocument();
    const more = screen.getByRole("list", { name: "More in Drama" });
    expect(within(more).getByRole("link", { name: "Street Play" })).toHaveAttribute("href", "/explore?genre=Street%20Play");
  });

  it("says plainly when an art form has nothing on yet, with a way on", async () => {
    open("/explore?category=dance");
    expect(await screen.findByText(/No dance nights are on sale yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See what's on" })).toHaveAttribute("href", "/whats-on");
  });

  it("lets a visitor switch art form from the top", async () => {
    open("/explore?category=drama");
    const nav = await screen.findByRole("navigation", { name: "Art forms" });
    expect(within(nav).getByRole("link", { name: "Comedy" })).toHaveAttribute("href", "/explore?category=comedy");
    expect(within(nav).getByRole("link", { name: "Drama" })).toHaveAttribute("aria-current", "page");
  });

  it("invites artists and hosts in, tailored to who is looking", async () => {
    const { unmount } = open("/explore?genre=Improv", "out");
    expect(await screen.findByRole("button", { name: "Join as an artist" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start hosting" })).toBeInTheDocument();
    expect(screen.getByText("Host an improv night")).toBeInTheDocument();
    unmount();

    open("/explore?genre=Improv", "host");
    expect(await screen.findByRole("link", { name: "Create an event" })).toHaveAttribute("href", "/host/events/new");
  });
});
