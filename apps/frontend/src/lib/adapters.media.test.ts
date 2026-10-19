import { describe, expect, it } from "vitest";
import { API_BASE } from "./api";
import { mediaUrl } from "./adapters";

const apiOrigin = new URL(API_BASE, window.location.origin).origin;

describe("mediaUrl", () => {
  it("points seed imagery at the copy the website itself serves", () => {
    expect(mediaUrl(`${apiOrigin}/media/artists/bansuri-flautist.jpg`)).toBe(
      "/media/artists/bansuri-flautist.jpg",
    );
    expect(mediaUrl(`${apiOrigin}/media/venues/brick-bar-stools.jpg`)).toBe(
      "/media/venues/brick-bar-stools.jpg",
    );
  });

  it("leaves an uploaded photo at the address it was uploaded to", () => {
    const uploaded = `${apiOrigin}/media/artists/2026/10/me.png`;
    expect(mediaUrl(uploaded)).toBe(uploaded);
    const poster = `${apiOrigin}/media/events/posters/2026/10/night.jpg`;
    expect(mediaUrl(poster)).toBe(poster);
  });

  it("passes other hosts through and ignores nothing", () => {
    expect(mediaUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(mediaUrl(undefined)).toBeUndefined();
    expect(mediaUrl("")).toBeUndefined();
  });
});
