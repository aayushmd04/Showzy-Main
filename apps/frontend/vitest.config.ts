import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Kept separate from vite.config.ts so the Tailwind plugin stays out of the
 * test pipeline — it has no job here and slows every run.
 *
 * happy-dom rather than jsdom: jsdom 29 pulls html-encoding-sniffer 6, which
 * is CommonJS but requires an ESM-only dependency. Node refuses that, and the
 * whole suite failed to start rather than failing a test.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // Tests must never reach a real server. A developer usually has the API
    // running on :8000, and a test that signs in with a made-up token would be
    // answered with a 401 and signed straight back out. Port 9 refuses at once.
    env: { VITE_API_BASE: "http://127.0.0.1:9/api/v1" },
    // restoreMocks alone leaves call history on vi.fn()s created inside a
    // vi.mock factory — they are not spies over a real object, so there is
    // nothing to restore. Without clearMocks, "was never called" assertions
    // see the previous test's calls.
    clearMocks: true,
    restoreMocks: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}", "build/**/*.test.ts"],
  },
});
