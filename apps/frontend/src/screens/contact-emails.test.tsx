import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppStoreProvider } from "@/store/app-store";
import { AuthSheetProvider } from "@/components/naada/auth-sheet";
import { LegalScreen } from "./legal";
import { SUPPORT_EMAIL } from "@/lib/site";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  getSiteConfig: () => Promise.reject(new Error("offline")),
}));

describe("contact addresses", () => {
  it("shows the real support address on the contact page as a mailto link, never a placeholder", async () => {
    render(
      <MemoryRouter>
        <AppStoreProvider>
          <AuthSheetProvider>
            <LegalScreen doc="contact" />
          </AuthSheetProvider>
        </AppStoreProvider>
      </MemoryRouter>,
    );
    const links = await screen.findAllByRole("link", { name: SUPPORT_EMAIL });
    expect(links.length).toBeGreaterThan(0);
    for (const l of links) expect(l).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    expect(document.body.textContent).not.toContain("[support email]");
  });

  it("uses the showzy.in domain for the support address", () => {
    expect(SUPPORT_EMAIL).toBe("support@showzy.in");
  });

  it("has no address on the old brand domains anywhere in the app source", () => {
    const files = import.meta.glob(["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const offenders = Object.entries(files)
      .filter(([, text]) => /@naada\.(live|in|com)\b/i.test(text))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
