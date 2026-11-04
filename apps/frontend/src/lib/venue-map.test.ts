import { describe, expect, it } from "vitest";
import { addressLine, directionsUrl, normaliseLink, safeHttpUrl } from "./venue-map";

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

describe("normaliseLink", () => {
  it("adds the https:// people leave off, and leaves real schemes alone", () => {
    expect(normaliseLink("maps.app.goo.gl/abc")).toBe("https://maps.app.goo.gl/abc");
    expect(normaliseLink("  https://goo.gl/maps/x ")).toBe("https://goo.gl/maps/x");
    expect(normaliseLink("javascript:alert(1)")).toBe("javascript:alert(1)");
    expect(normaliseLink("")).toBe("");
  });
});

describe("addressLine", () => {
  it("joins what is there and skips what is not", () => {
    expect(
      addressLine({ address_line1: "12, 4th Main", area_name: "Vijayanagar", city_name: "Mysuru", pincode: "570017" }),
    ).toBe("12, 4th Main, Vijayanagar, Mysuru 570017");
    expect(addressLine({ address_line1: " 3 Cross ", address_line2: "" })).toBe("3 Cross");
    expect(addressLine({})).toBe("");
    // The area already typed into the address is not repeated.
    expect(addressLine({ address_line1: "16 Demo Street, Koramangala", area_name: "Koramangala", city_name: "Bengaluru" })).toBe(
      "16 Demo Street, Koramangala, Bengaluru",
    );
  });
});

describe("directionsUrl", () => {
  it("uses the host's own Maps link", () => {
    expect(directionsUrl({ google_maps_url: "https://maps.app.goo.gl/x" })).toBe("https://maps.app.goo.gl/x");
  });

  it("ignores an unsafe link and searches for the address instead", () => {
    const url = directionsUrl({ google_maps_url: "javascript:alert(1)", address_line1: "12, 4th Main" })!;
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    expect(url).not.toMatch(/javascript/i);
  });

  it("searches for the address, encoded, when there is no link", () => {
    const url = directionsUrl({ name: "Café & Co", address_line1: "12, 4th Main", city_name: "Mysuru" })!;
    expect(decodeURIComponent(url.split("query=")[1])).toBe("Café & Co, 12, 4th Main, Mysuru");
    expect(url).not.toContain(" ");
  });

  it("is null when there is nothing to point at", () => {
    expect(directionsUrl({})).toBeNull();
  });
});
