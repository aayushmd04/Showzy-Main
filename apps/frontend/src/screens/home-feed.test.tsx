import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";
import { HomeFeed } from "./home-feed";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));

const venues: Venue[] = [{ id: "v1", slug: "koramangala-loft", name: "Koramangala Loft", area: "Koramangala", capacity: 110 }];
const artists: Artist[] = [
  { id: "a1", name: "Divya Nair", genres: ["Carnatic Fusion"], city: "Mysuru", feeMin: 4000, feeMax: 15000, gigsPlayed: 1, rating: 0, bio: "", kycStatus: "pending" },
];
const events: NaadaEvent[] = [
  {
    id: "e1", name: "Late Bloom Improv: Tonight's Show", venueId: "v1", hostId: "h", date: "2099-03-01", time: "20:00",
    status: "published", genres: ["Improv"], lineup: [], tiers: [{ name: "General", price: 250, capacity: 70, sold: 10 }],
    description: "", checkedIn: 0,
  },
];

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function open(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <AppStoreProvider seed={{ events, artists, venues }}>
        <AuthSheetProvider>
          <Routes>
            <Route path="/whats-on" element={<HomeFeed />} />
            <Route path="/explore" element={<Where />} />
          </Routes>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Home — search", () => {
  it("finds an artist by name and links to their page", async () => {
    open("/whats-on?q=divya");
    const section = await screen.findByRole("region", { name: "Artists" });
    expect(within(section).getByRole("link", { name: /Divya Nair/ })).toHaveAttribute("href", "/a/a1");
    expect(screen.getByRole("status")).toHaveTextContent("1 result");
  });

  it("finds a venue by name and links to its page", async () => {
    open("/whats-on?q=koramangala");
    const section = await screen.findByRole("region", { name: "Venues" });
    expect(within(section).getByRole("link", { name: /Koramangala Loft/ })).toHaveAttribute("href", "/v/koramangala-loft");
    // ...and the night held there, in its own section.
    expect(screen.getByRole("region", { name: "Events" })).toBeInTheDocument();
  });

  it("finds an event by its genre", async () => {
    open("/whats-on?q=improv");
    expect((await screen.findAllByText("Late Bloom Improv: Tonight's Show")).length).toBeGreaterThan(0);
  });

  it("says nothing matched, rather than showing a blank page", async () => {
    open("/whats-on?q=zzzz");
    expect(await screen.findByText("Nothing matched that search")).toBeInTheDocument();
  });
});

describe("Home — art form tiles", () => {
  it("a 'best of live arts' tile opens that art form's own page instead of scrolling to the top", async () => {
    const user = userEvent.setup();
    open("/whats-on");
    await user.click(await screen.findByRole("link", { name: /^improv\s*1 event/i }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/explore?genre=Improv");
  });

  it("a category pill opens that category's page", async () => {
    const user = userEvent.setup();
    open("/whats-on");
    await user.click(await screen.findByRole("button", { name: "Drama" }));
    expect(await screen.findByTestId("where")).toHaveTextContent("/explore?category=drama");
  });

  it("an artist and a venue on the home page link to their own pages", async () => {
    open("/whats-on");
    const hrefs = async (name: RegExp) =>
      (await screen.findAllByRole("link", { name })).map((l) => l.getAttribute("href"));
    expect(await hrefs(/Divya Nair/)).toContain("/a/a1");
    expect(await hrefs(/Koramangala Loft/)).toContain("/v/koramangala-loft");
  });
});
