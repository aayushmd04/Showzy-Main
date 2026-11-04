import { describe, expect, it } from "vitest";
import { categoryOf, groupByCategory, inCategory } from "./categories";

describe("inCategory", () => {
  it("puts the seeded genres under Music", () => {
    for (const g of ["Open Mic", "Blues", "Jazz", "Folk", "Carnatic Fusion"]) {
      expect(inCategory("music", [g])).toBe(true);
    }
  });

  it("finds dance, drama, comedy and art by the words in a genre", () => {
    expect(inCategory("dance", ["Kathak"])).toBe(true);
    expect(inCategory("drama", ["Street Play"])).toBe(true);
    expect(inCategory("comedy", ["Stand-up"])).toBe(true);
    expect(inCategory("art", ["Spoken Word"])).toBe(true);
  });

  it("does not leak music genres into the other categories", () => {
    for (const id of ["drama", "dance", "comedy", "art"] as const) {
      expect(inCategory(id, ["Blues", "Jazz"])).toBe(false);
    }
  });

  it("matches an event with several genres if any one fits", () => {
    expect(inCategory("dance", ["Classical", "Kathak"])).toBe(true);
  });
});


describe("categoryOf", () => {
  it("places genres under their art form", () => {
    expect(categoryOf("Improv")?.id).toBe("comedy");
    expect(categoryOf("Street Play")?.id).toBe("drama");
    expect(categoryOf("Kathak")?.id).toBe("dance");
    expect(categoryOf("Carnatic Fusion")?.id).toBe("music");
    expect(categoryOf("Painting Workshop")?.id).toBe("art");
  });

  it("returns null for a genre that fits none", () => {
    expect(categoryOf("Underwater Basket Weaving")).toBeNull();
  });
});

describe("groupByCategory", () => {
  it("groups in the site's own order with anything unknown last", () => {
    const genres = ["Kathak", "Improv", "Mystery", "Jazz", "Theatre"];
    const groups = groupByCategory(genres, (g) => g);
    expect(groups.map((g) => g.category?.id ?? "other")).toEqual(["music", "drama", "dance", "comedy", "other"]);
    expect(groups.find((g) => g.category?.id === "drama")?.items).toEqual(["Theatre"]);
  });
});
