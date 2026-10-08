import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { PublicShell } from "./public-shell";

// The header's city picker asks the API for cities; keep the test off the network.
vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getCities: vi.fn().mockResolvedValue([]),
}));

/**
 * The header is one section strip that is always rendered and scrolls sideways
 * when it does not fit. An earlier version had a desktop copy and a phone-only
 * copy of the links, and an inline `display` on the desktop copy outranked the
 * media query that hid it, so every page measured wider than a phone and
 * scrolled sideways. With a single strip there is nothing to hide, so these
 * check the strip itself: every section is reachable, the current one is
 * marked, and nothing re-declares `display` inline.
 */
function renderShell(path = "/artists") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppStoreProvider seed={{ events: [], artists: [], venues: [] }}>
        <AuthSheetProvider>
          <PublicShell>
            <p>page content</p>
          </PublicShell>
        </AuthSheetProvider>
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

const SECTIONS = ["What's on", "Artists", "Venues", "How it works"];

describe("PublicShell navigation", () => {
  it("keeps every section reachable in one strip", () => {
    renderShell();
    const strip = screen.getByRole("navigation", { name: "Sections" });

    for (const label of SECTIONS) {
      expect(within(strip).getByText(label)).toBeInTheDocument();
    }
    expect(within(strip).getByText("Venues").closest("a")).toHaveAttribute("href", "/venues");
  });

  it("scrolls the strip instead of widening the page", () => {
    renderShell();
    const strip = screen.getByRole("navigation", { name: "Sections" });

    expect(strip.className).toContain("overflow-x-auto");
    expect(strip.style.display).toBe("");
  });

  it("marks the current section", () => {
    renderShell("/venues");
    const strip = screen.getByRole("navigation", { name: "Sections" });

    expect(within(strip).getByText("Venues").closest("a")).toHaveAttribute("aria-current", "page");
    expect(within(strip).getByText("Artists").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("has a search box", () => {
    renderShell();
    expect(screen.getAllByRole("searchbox").length).toBeGreaterThan(0);
  });

  it("keeps the four policy pages in the footer", () => {
    // A payment gateway's merchant review checks these resolve, and a buyer
    // chasing a refund shouldn't have to guess the URL.
    renderShell();
    for (const label of ["Terms", "Privacy", "Refunds", "Contact"]) {
      expect(screen.getByText(label).closest("a")).toHaveAttribute(
        "href",
        `/${label.toLowerCase()}`,
      );
    }
  });
});
