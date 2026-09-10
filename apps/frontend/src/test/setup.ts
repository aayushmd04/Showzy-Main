import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// Screens animate with motion and observe layout; happy-dom ships neither.
if (!("matchMedia" in window)) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
}

for (const name of ["IntersectionObserver", "ResizeObserver"] as const) {
  if (!(name in window)) {
    Object.defineProperty(window, name, {
      writable: true,
      value: class {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    });
  }
}

if (!window.scrollTo) {
  Object.defineProperty(window, "scrollTo", { writable: true, value: vi.fn() });
}

/**
 * motion prefers the Web Animations API when `Element.prototype.animate`
 * exists. happy-dom provides it, but cancelling one of its animations rejects
 * a `finished` promise nobody is holding — so every modal that opened and
 * closed during a test surfaced as an unhandled AbortError and took the run's
 * exit code with it. Removing the hook drops motion onto its own JS animation
 * path, which is what jsdom-based setups get anyway.
 */
if (Object.prototype.hasOwnProperty.call(Element.prototype, "animate")) {
  // @ts-expect-error — deliberately hiding an API that misbehaves under test.
  delete Element.prototype.animate;
}
