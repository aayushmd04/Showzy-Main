import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { VenueLocationCard } from "./venue-location-card";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getVenue: vi.fn(),
  updateVenue: vi.fn(),
}));

const venue = (over: Partial<api.ApiVenue> = {}): api.ApiVenue => ({
  id: "v1",
  name: "Gokulam Hall",
  slug: "gokulam",
  city_name: "Mysuru",
  address_line1: "12, 4th Main",
  address_line2: "",
  pincode: "570017",
  google_maps_url: "",
  ...over,
});

describe("VenueLocationCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getVenue).mockResolvedValue(venue());
  });

  it("starts from what is on file and previews what guests see", async () => {
    render(<VenueLocationCard slug="gokulam" name="Gokulam Hall" />);
    expect(await screen.findByLabelText("Address")).toHaveValue("12, 4th Main");
    expect(screen.getByLabelText("Pincode")).toHaveValue("570017");
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
    expect(screen.getByText(/12, 4th Main, Mysuru 570017/)).toBeInTheDocument();
  });

  it("saves the pasted Maps link with the address", async () => {
    vi.mocked(api.updateVenue).mockResolvedValue(venue({ google_maps_url: "https://maps.app.goo.gl/abc" }));
    const user = userEvent.setup();
    render(<VenueLocationCard slug="gokulam" name="Gokulam Hall" />);
    await user.type(await screen.findByLabelText("Google Maps link"), "https://maps.app.goo.gl/abc");
    expect(screen.getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://maps.app.goo.gl/abc");

    await user.click(screen.getByRole("button", { name: "Save location" }));

    await waitFor(() =>
      expect(api.updateVenue).toHaveBeenCalledWith("gokulam", {
        address_line1: "12, 4th Main",
        address_line2: "",
        pincode: "570017",
        google_maps_url: "https://maps.app.goo.gl/abc",
      }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
  });

  it("adds the https:// a host leaves off", async () => {
    vi.mocked(api.updateVenue).mockResolvedValue(venue());
    const user = userEvent.setup();
    render(<VenueLocationCard slug="gokulam" name="Gokulam Hall" />);
    await user.type(await screen.findByLabelText("Google Maps link"), "maps.app.goo.gl/abc");
    await user.click(screen.getByRole("button", { name: "Save location" }));
    await waitFor(() =>
      expect(api.updateVenue).toHaveBeenCalledWith(
        "gokulam",
        expect.objectContaining({ google_maps_url: "https://maps.app.goo.gl/abc" }),
      ),
    );
  });

  it("blocks a link that is not a web address", async () => {
    const user = userEvent.setup();
    render(<VenueLocationCard slug="gokulam" name="Gokulam Hall" />);
    await user.type(await screen.findByLabelText("Google Maps link"), "javascript:alert(1)");
    expect(screen.getByText(/doesn't look like a web address/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save location" })).toBeDisabled();
  });

  it("shows the server's reason when saving fails, and keeps the edits", async () => {
    vi.mocked(api.updateVenue).mockRejectedValue(new api.ApiError(400, "That doesn't look like a web address."));
    const user = userEvent.setup();
    render(<VenueLocationCard slug="gokulam" name="Gokulam Hall" />);
    await user.clear(await screen.findByLabelText("Address"));
    await user.type(screen.getByLabelText("Address"), "99 New Road");
    await user.click(screen.getByRole("button", { name: "Save location" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't look like a web address");
    expect(screen.getByLabelText("Address")).toHaveValue("99 New Road");
  });
});
