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
    restoreMocks: true,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
