import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import * as api from "@/lib/api";
import { VenueProfileScreen } from "./venue-profile";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
  getVenuePage: vi.fn(),
  followVenue: vi.fn(),
}));
vi.mock("./not-found", () => ({ NotFoundScreen: () => <p>Page not found</p> }));

const night = (id: string, title: string, start: string): api.ApiVenueNight => ({
  id, title, start_datetime: start, poster_image: null, genres: ["Improv"],
});

const VENUE: api.ApiVenuePage = {
  id: "v1",
  slug: "koramangala-loft",
  name: "Koramangala Loft",
  tagline: "A first-floor room for comedy.",
  description: "Comedy and spoken word, most weeks.",
  capacity: 110,
  area_name: "Koramangala",
  city_name: "Bengaluru",
  address_line1: "16 Demo Street",
  pincode: "560034",
  google_maps_url: "https://maps.app.goo.gl/loft",
  stage_type: "indoor",
  has_sound_system: true,
  has_bar: true,
  is_verified: true,
  photos: [
    { id: 1, image: "/media/venues/mic-in-light-beam.jpg", caption: "", is_primary: true },
    { id: 2, image: "/media/venues/curtained-stage-mic.jpg", caption: "", is_primary: false },
  ],
  hours: [{ day_of_week: 4, open_time: "18:00:00", close_time: "23:30:00", is_closed: false, notes: "" }],
  follower_count: 12,
  is_following: false,
  avg_rating: 4.5,
  review_count: 2,
  recent_reviews: [
    { id: "r1", reviewer_name: "Asha Rao", rating: 5, comment: "Brilliant room", event_title: "Last Jam", is_verified_attendee: true, created_at: "2026-10-01T10:00:00Z" },
  ],
  upcoming_events: [night("e1", "Improv Night", "2099-01-05T19:00:00+05:30")],
  past_events: [night("e0", "Last Month's Jam", "2020-01-05T19:00:00+05:30")],
};

/** "12 followers": the number sits in its own span in the page, so match on the whole element. */
const followers = (n: number) => (_: string, el: Element | null) =>
  el?.tagName === "SPAN" && new RegExp(`^\\s*${n}\\s+followers?\\s*$`).test(el.textContent ?? "");

function As({ signedIn }: { signedIn: boolean }) {
  const { setRole, setCurrentUser } = useStore();
  useEffect(() => {
    if (signedIn) {
      setRole("listener");
      setCurrentUser({ id: "u1", email: "f@x.in", full_name: "Fan", role: "attendee" });
    }
  }, [signedIn, setRole, setCurrentUser]);
  return null;
}

function open(signedIn = false) {
  return render(
    <MemoryRouter initialEntries={["/v/koramangala-loft"]}>
      <AppStoreProvider>
        <AuthSheetProvider>
          <As signedIn={signedIn} />
          <Routes>
            <Route path="/v/:slug" element={<VenueProfileScreen />} />
          </Routes>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("Venue page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getVenuePage).mockResolvedValue(VENUE);
  });

  it("shows the room, what's on, what it has hosted and what people said", async () => {
    open();
    expect(await screen.findByRole("heading", { level: 1, name: /Koramangala Loft/i })).toBeInTheDocument();
    expect(screen.getByText("A first-floor room for comedy.")).toBeInTheDocument();
    expect(screen.getByText("Improv Night")).toBeInTheDocument();
    expect(screen.getByText("Last Month's Jam")).toBeInTheDocument();
    expect(screen.getByText("Brilliant room")).toBeInTheDocument();
    expect(screen.getByText("Was there")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "4.5 out of 5" })).toBeInTheDocument();
    expect(screen.getByText(followers(12))).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Improv Night/ })).toHaveAttribute("href", "/e/e1");
  });

  it("gives directions and the room's facilities, and shows hours", async () => {
    open();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://maps.app.goo.gl/loft");
    expect(screen.getByText("Sound system")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
    expect(screen.getByText("18:00–23:30")).toBeInTheDocument();
  });

  it("offers no way to reach the venue directly and no prices", async () => {
    open();
    await screen.findByRole("heading", { level: 1 });
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/@/); // no email address anywhere
    expect(text).not.toMatch(/\+91/);
    expect(screen.queryByText(/hire|rent|per hour/i)).not.toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in before following", async () => {
    const user = userEvent.setup();
    open(false);
    await user.click(await screen.findByRole("button", { name: "Follow Koramangala Loft" }));
    expect(api.followVenue).not.toHaveBeenCalled();
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("follows and unfollows for a signed-in visitor, moving the count at once", async () => {
    vi.mocked(api.followVenue)
      .mockResolvedValueOnce({ following: true, follower_count: 13 })
      .mockResolvedValueOnce({ following: false, follower_count: 12 });
    const user = userEvent.setup();
    open(true);
    await user.click(await screen.findByRole("button", { name: "Follow Koramangala Loft" }));
    await waitFor(() => expect(api.followVenue).toHaveBeenCalledWith("koramangala-loft", true));
    expect(await screen.findByRole("button", { name: "Unfollow Koramangala Loft" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(followers(13))).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Unfollow Koramangala Loft" }));
    await waitFor(() => expect(api.followVenue).toHaveBeenLastCalledWith("koramangala-loft", false));
    expect(await screen.findByText(followers(12))).toBeInTheDocument();
  });

  it("puts the follow back and says why when the server refuses", async () => {
    vi.mocked(api.followVenue).mockRejectedValue(new api.ApiError(500, "boom"));
    const user = userEvent.setup();
    open(true);
    await user.click(await screen.findByRole("button", { name: "Follow Koramangala Loft" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Follow Koramangala Loft" })).toBeInTheDocument();
    expect(screen.getByText(followers(12))).toBeInTheDocument();
  });

  it("says plainly when there are no nights or reviews yet", async () => {
    vi.mocked(api.getVenuePage).mockResolvedValue({
      ...VENUE, upcoming_events: [], past_events: [], recent_reviews: [], avg_rating: null, review_count: 0,
    });
    open();
    expect(await screen.findByText(/Nothing announced yet/)).toBeInTheDocument();
    expect(screen.getByText(/No reviews yet/)).toBeInTheDocument();
    expect(screen.queryByText("Hosted here")).not.toBeInTheDocument();
  });

  it("shows not-found for a venue that doesn't exist", async () => {
    vi.mocked(api.getVenuePage).mockRejectedValue(new api.ApiError(404, "Not found."));
    open();
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
  });

  it("offers a retry when the venue can't be loaded", async () => {
    vi.mocked(api.getVenuePage).mockRejectedValueOnce(new TypeError("offline")).mockResolvedValueOnce(VENUE);
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: /Koramangala Loft/i })).toBeInTheDocument();
  });
});
