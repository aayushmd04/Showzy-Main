import { describe, expect, it } from "vitest";
import {
  addressLine,
  coordinatesOf,
  directionsUrl,
  embedUrl,
  parseCoordinates,
  safeHttpUrl,
} from "./venue-map";

describe("safeHttpUrl", () => {
  it("passes http and https, and nothing else", () => {
    expect(safeHttpUrl("https://maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(safeHttpUrl("http://x.in/m")).toBe("http://x.in/m");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeHttpUrl("ftp://x.in")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
  });
});

describe("coordinatesOf", () => {
  it("reads the strings the API sends", () => {
    expect(coordinatesOf({ lat: "12.295800", lng: "76.639400" })).toEqual({ lat: 12.2958, lng: 76.6394 });
  });

  it("needs both halves and a real place on the planet", () => {
    expect(coordinatesOf({ lat: "12.3", lng: null })).toBeNull();
    expect(coordinatesOf({ lat: null, lng: null })).toBeNull();
    expect(coordinatesOf({ lat: "", lng: "" })).toBeNull();
    expect(coordinatesOf({ lat: "91", lng: "10" })).toBeNull();
    expect(coordinatesOf({ lat: "10", lng: "-181" })).toBeNull();
    expect(coordinatesOf({ lat: "abc", lng: "10" })).toBeNull();
  });

  it("keeps a pin on the equator or the meridian (zero is a place)", () => {
    expect(coordinatesOf({ lat: 0, lng: 0 })).toEqual({ lat: 0, lng: 0 });
  });
});

describe("parseCoordinates", () => {
  it("reads the pair Google Maps copies", () => {
    expect(parseCoordinates("12.2958, 76.6394")).toEqual({ lat: 12.2958, lng: 76.6394 });
    expect(parseCoordinates("12.2958 76.6394")).toEqual({ lat: 12.2958, lng: 76.6394 });
    expect(parseCoordinates("  -12.5,77  ")).toEqual({ lat: -12.5, lng: 77 });
  });

  it("finds the pin inside a Maps link", () => {
    expect(
      parseCoordinates("https://www.google.com/maps/place/Venue/@12.2958,76.6394,17z/data=!3m1"),
    ).toEqual({ lat: 12.2958, lng: 76.6394 });
    expect(parseCoordinates("https://maps.google.com/x/data=!3d12.29!4d76.63")).toEqual({ lat: 12.29, lng: 76.63 });
  });

  it("returns null for anything else", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("near the palace")).toBeNull();
    expect(parseCoordinates("120.5, 76.6")).toBeNull();
  });
});

describe("addressLine", () => {
  it("joins what is there and skips what is not", () => {
    expect(
      addressLine({ address_line1: "12, 4th Main", area_name: "Vijayanagar", city_name: "Mysuru", pincode: "570017" }),
    ).toBe("12, 4th Main, Vijayanagar, Mysuru 570017");
    expect(addressLine({ address_line1: " 3 Cross ", address_line2: "" })).toBe("3 Cross");
    expect(addressLine({})).toBe("");
  });
});

describe("directionsUrl", () => {
  it("prefers the host's own Maps link", () => {
    expect(directionsUrl({ google_maps_url: "https://maps.app.goo.gl/x", lat: "1", lng: "2" })).toBe(
      "https://maps.app.goo.gl/x",
    );
  });

  it("ignores an unsafe link and falls back to the pin", () => {
    expect(directionsUrl({ google_maps_url: "javascript:alert(1)", lat: "12.3", lng: "76.6" })).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=12.3,76.6",
    );
  });

  it("falls back to a search for the address, encoded", () => {
    const url = directionsUrl({ name: "Café & Co", address_line1: "12, 4th Main", city_name: "Mysuru" })!;
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(decodeURIComponent(url.split("query=")[1])).toBe("Café & Co, 12, 4th Main, Mysuru");
    expect(url).not.toContain(" ");
  });

  it("is null when there is nothing to point at", () => {
    expect(directionsUrl({})).toBeNull();
  });
});

describe("embedUrl", () => {
  it("is an openstreetmap embed with a marker on the pin", () => {
    const url = new URL(embedUrl({ lat: 12.2958, lng: 76.6394 }));
    expect(url.origin).toBe("https://www.openstreetmap.org");
    expect(url.pathname).toBe("/export/embed.html");
    expect(url.searchParams.get("marker")).toBe("12.295800,76.639400");
    const [w, s, e, n] = url.searchParams.get("bbox")!.split(",").map(Number);
    expect(w).toBeLessThan(76.6394);
    expect(e).toBeGreaterThan(76.6394);
    expect(s).toBeLessThan(12.2958);
    expect(n).toBeGreaterThan(12.2958);
  });
});
