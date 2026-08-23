import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Belt-and-braces: unmount whatever the previous test rendered (including
// anything portalled straight onto document.body, like <Modal>) before the
// next test starts, so component instances never bleed into each other.
afterEach(() => {
  cleanup();
});

/**
 * jsdom doesn't implement matchMedia. `motion/react`'s `useReducedMotion` (used
 * on nearly every screen) calls it on mount, so every component test needs
 * this shim regardless of what it's actually testing.
 *
 * Reports `prefers-reduced-motion: reduce` as matched, which every animated
 * component in this app treats as "skip the animation" (`transition={{
 * duration: reduce ? 0 : ... }}`). Without this, modals and lists animate on
 * their real timers and assertions race the exit transition.
 */
if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
