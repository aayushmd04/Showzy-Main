import { describe, expect, it } from "vitest";
import { inCategory } from "./categories";

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
