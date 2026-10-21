import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { ArtistProfileBuilderScreen } from "./artist-profile-builder";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getMyArtistProfile: vi.fn(),
    getGenres: vi.fn(),
    getCities: vi.fn(),
    updateArtist: vi.fn(),
  };
});

const profile = {
  id: "artist-1",
  user: { id: "u1", full_name: "Newbie Singer", email: "n@x.test" },
  stage_name: "Newbie Singer",
  stage_name_kn: "",
  bio: "",
  city: null,
  genres: [],
  photos: [],
  availability: { blackout_dates: [], notes: "" },
  instagram: "",
  youtube: "",
  website: "",
  total_gigs: 0,
  avg_rating: 0,
  is_following: false,
  follower_count: 0,
  is_verified: false,
  profile_gaps: ["a photo"],
};

function renderScreen() {
  return render(
    <MemoryRouter initialEntries={["/artist/profile"]}>
      <AppStoreProvider>
        <ArtistProfileBuilderScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

/**
 * A musician with no website left it empty, or typed "none", and the error that
 * came back sat at the top of a long page, far from the Save button they had
 * just pressed — so the profile looked like it simply wouldn't save.
 */
describe("ArtistProfileBuilderScreen — optional links", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getMyArtistProfile).mockResolvedValue(profile as never);
    vi.mocked(api.getGenres).mockResolvedValue([]);
    vi.mocked(api.getCities).mockResolvedValue([]);
  });

  it("marks the website as optional and says an empty box is fine", async () => {
    renderScreen();
    expect(await screen.findByLabelText("Website (optional)")).not.toBeRequired();
    expect(screen.getByText("Don't have one? Leave it empty.")).toBeInTheDocument();
  });

  it("saves with no website at all", async () => {
    vi.mocked(api.updateArtist).mockResolvedValue({ ...profile, bio: "x" } as never);
    const user = userEvent.setup();
    renderScreen();

    await user.type(await screen.findByLabelText("Bio"), "Sitar and tabla.");
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    await waitFor(() => expect(api.updateArtist).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.updateArtist).mock.calls[0][1]).toMatchObject({ website: "" });
  });

  it("puts a bad website's message under the website box, not only at the top", async () => {
    vi.mocked(api.updateArtist).mockRejectedValue(
      new api.ApiError(400, "That doesn't look like a web address.", {
        website: ["That doesn't look like a web address. Something like yourband.com works."],
      }),
    );
    const user = userEvent.setup();
    renderScreen();

    const website = await screen.findByLabelText("Website (optional)");
    await user.type(website, "my band is on instagram");
    await user.click(screen.getAllByRole("button", { name: "Save changes" })[0]);

    expect(await screen.findByText(/Something like yourband\.com works/)).toBeInTheDocument();
    expect(website).toHaveAttribute("aria-invalid", "true");

    // Fixing the field clears its error.
    await user.clear(website);
    expect(website).not.toHaveAttribute("aria-invalid");
  });

  it("does not count a missing website against profile completeness", async () => {
    renderScreen();
    await screen.findByLabelText("Website (optional)");
    // Only the stage name is filled in: 1 of the 6 things a host looks for.
    expect(screen.getByRole("progressbar", { name: "Profile completeness" })).toHaveAttribute(
      "aria-valuenow",
      "17",
    );
  });
});
