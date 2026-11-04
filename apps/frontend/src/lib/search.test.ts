import { describe, expect, it } from "vitest";
import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";
import { normalise, searchAll } from "./search";

const venue = (id: string, name: string, area = ""): Venue => ({ id, name, area, capacity: 50 });
const artist = (id: string, name: string, genres: string[], city = "Mysuru"): Artist => ({
  id, name, genres, city, feeMin: 4000, feeMax: 15000, gigsPlayed: 3, rating: 0, bio: "", kycStatus: "pending",
});
const event = (id: string, name: string, venueId: string, genres: string[], lineup: string[] = []): NaadaEvent => ({
  id, name, venueId, hostId: "h", date: "2099-01-01", time: "19:00", status: "published",
  genres, lineup, tiers: [], description: "", checkedIn: 0,
});

const venues = [venue("v1", "Gokulam Music Hall", "Gokulam"), venue("v2", "Café Kaveri", "Jayanagar")];
const artists = [artist("a1", "Divya Nair", ["Carnatic Fusion", "Classical"]), artist("a2", "Late Bloom Improv", ["Improv"], "Bengaluru")];
const events = [
  event("e1", "Late Bloom Improv: Tonight's Show", "v2", ["Improv", "Stand-up Comedy"], ["a2"]),
  event("e2", "Carnatic Evening", "v1", ["Classical"], ["a1"]),
];
const sources = { events, artists, venues, venueOf: (e: NaadaEvent) => venues.find((v) => v.id === e.venueId) };

describe("normalise", () => {
  it("ignores case, accents and punctuation", () => {
    expect(normalise("Café Kaveri")).toBe("cafe kaveri");
    expect(normalise("Stand-up!")).toBe("stand up!");
    expect(normalise("  Tonight's   Show ")).toBe("tonight s show");
  });
});

describe("searchAll", () => {
  it("finds an artist by name — something event-only search never could", () => {
    const r = searchAll("divya", sources);
    expect(r.artists.map((a) => a.id)).toEqual(["a1"]);
    // ...and the night they are on, through the line-up.
    expect(r.events.map((e) => e.id)).toEqual(["e2"]);
  });

  it("finds a venue by name or area, and the nights held there", () => {
    expect(searchAll("gokulam", sources).venues.map((v) => v.id)).toEqual(["v1"]);
    expect(searchAll("gokulam", sources).events.map((e) => e.id)).toEqual(["e2"]);
    expect(searchAll("jayanagar", sources).venues.map((v) => v.id)).toEqual(["v2"]);
  });

  it("matches without accents or hyphens", () => {
    expect(searchAll("cafe", sources).venues).toHaveLength(1);
    expect(searchAll("stand up", sources).events.map((e) => e.id)).toEqual(["e1"]);
  });

  it("needs every word, in any order", () => {
    expect(searchAll("improv bloom", sources).artists).toHaveLength(1);
    expect(searchAll("improv carnatic", sources)).toEqual({ events: [], artists: [], venues: [] });
  });

  it("finds an artist by genre or city", () => {
    expect(searchAll("classical", sources).artists.map((a) => a.id)).toEqual(["a1"]);
    expect(searchAll("bengaluru", sources).artists.map((a) => a.id)).toEqual(["a2"]);
  });

  it("returns nothing for an empty query", () => {
    expect(searchAll("   ", sources)).toEqual({ events: [], artists: [], venues: [] });
  });

  it("never searches fees, so a rate typed into the box finds no one", () => {
    expect(searchAll("4000", sources).artists).toHaveLength(0);
  });
});
