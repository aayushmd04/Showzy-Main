import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { PublicShell } from "./public-shell";

/**
 * These cover one specific regression, and it is a sneaky one.
 *
 * The nav links element had `className="discover-nav-links"` — whose media
 * query sets `display: none` below 900px — *and* an inline
 * `style={{ display: "flex" }}`. Inline wins, so the links were never hidden
 * on a phone despite a comment saying they were, and every page built on this
 * shell measured 681px inside a 375px viewport and scrolled sideways.
 *
 * jsdom doesn't apply the stylesheet, so a test can't ask whether something is
 * visible at 375px. It can ask the two things that actually went wrong: that
 * nothing re-declares `display` inline where a class is meant to control it,
 * and that hiding the desktop links leaves a reachable copy behind.
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
  it("lets the stylesheet decide whether the desktop links show", () => {
    const { container } = renderShell();
    const desktop = container.querySelector(".discover-nav-links");

    expect(desktop).not.toBeNull();
    // The whole bug in one assertion: an inline `display` here outranks the
    // media query that is supposed to hide this below 900px.
    expect((desktop as HTMLElement).style.display).toBe("");
  });

  it("keeps every section reachable from the phone-only row", () => {
    const { container } = renderShell();
    const mobileRow = container.querySelector(".discover-nav-mobile");

    expect(mobileRow).not.toBeNull();
    for (const label of SECTIONS) {
      expect(within(mobileRow as HTMLElement).getByText(label)).toBeInTheDocument();
    }
  });

  it("marks the current section in the phone row, not just the desktop one", () => {
    const { container } = renderShell("/venues");
    const mobileRow = container.querySelector(".discover-nav-mobile") as HTMLElement;

    expect(within(mobileRow).getByText("Venues").closest("a")).toHaveAttribute("href", "/venues");
    // The active pill is what tells someone where they are once the desktop
    // bar is gone, so it has to track the route down here too.
    expect(within(mobileRow).getByText("Venues")).toHaveStyle({ borderRadius: "999px" });
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
