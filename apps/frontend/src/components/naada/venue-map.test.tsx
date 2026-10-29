import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { VenueMap } from "./venue-map";

const spot = {
  name: "Gokulam Hall",
  address_line1: "12, 4th Main",
  city_name: "Mysuru",
  lat: "12.2958",
  lng: "76.6394",
  google_maps_url: "https://maps.app.goo.gl/abc",
};

describe("VenueMap", () => {
  it("shows the address and a directions link that opens safely in a new tab", () => {
    render(<VenueMap spot={spot} />);
    expect(screen.getByText("12, 4th Main, Mysuru")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Get directions/ });
    expect(link).toHaveAttribute("href", "https://maps.app.goo.gl/abc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("loads no map until the guest asks for it", async () => {
    const user = userEvent.setup();
    const { container } = render(<VenueMap spot={spot} />);
    expect(container.querySelector("iframe")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Show map" }));

    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/www\.openstreetmap\.org\/export\/embed\.html\?/);
    expect(frame).toHaveAttribute("title", "Map of Gokulam Hall");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show map" })).not.toBeInTheDocument();
  });

  it("offers directions but no map for a venue with no pin", () => {
    render(<VenueMap spot={{ name: "Backyard Cafe", address_line1: "3 Cross", city_name: "Mysuru" }} />);
    expect(screen.getByRole("link", { name: /Get directions/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show map" })).not.toBeInTheDocument();
  });

  it("never links an unsafe address", () => {
    render(<VenueMap spot={{ ...spot, google_maps_url: "javascript:alert(1)", lat: null, lng: null }} />);
    const href = screen.getByRole("link", { name: /Get directions/ }).getAttribute("href")!;
    expect(href.startsWith("https://www.google.com/maps/")).toBe(true);
    expect(href).not.toMatch(/javascript/i);
  });

  it("renders nothing when the venue has no location at all", () => {
    const { container } = render(<VenueMap spot={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
