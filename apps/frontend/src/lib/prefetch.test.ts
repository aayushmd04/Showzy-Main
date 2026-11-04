import { describe, expect, it, vi } from "vitest";

const { loaded } = vi.hoisted(() => ({ loaded: [] as string[] }));
vi.mock("@/screens/legal", () => {
  loaded.push("legal");
  return { LegalScreen: () => null };
});
vi.mock("@/screens/artists", () => {
  loaded.push("artists");
  return { ArtistsScreen: () => null };
});

import { internalPath, prefetchRoute } from "./prefetch";

describe("prefetchRoute", () => {
  it("loads the legal pages' code once, whichever legal page is hovered", async () => {
    prefetchRoute("/terms");
    prefetchRoute("/privacy");
    prefetchRoute("/cookies");
    await new Promise((r) => setTimeout(r, 20));
    expect(loaded.filter((x) => x === "legal")).toHaveLength(1);
  });

  it("ignores paths that are not a lazy page", () => {
    expect(() => prefetchRoute("/")).not.toThrow();
    expect(() => prefetchRoute("/host/events")).not.toThrow();
    expect(loaded).not.toContain("artists");
  });

  it("loads the artists page for /artists but not for /a/<id> (a different page)", async () => {
    prefetchRoute("/artists");
    await new Promise((r) => setTimeout(r, 20));
    expect(loaded).toContain("artists");
  });
});

describe("internalPath", () => {
  const link = (href: string, target = "") => {
    const a = document.createElement("a");
    a.href = href;
    if (target) a.target = target;
    return a;
  };

  it("returns the path of a link inside the site", () => {
    expect(internalPath(link("/terms"))).toBe("/terms");
  });

  it("returns null for another site or a new-tab link", () => {
    expect(internalPath(link("https://example.com/terms"))).toBeNull();
    expect(internalPath(link("/terms", "_blank"))).toBeNull();
  });
});
