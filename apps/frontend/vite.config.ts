import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    rollupOptions: {
      output: {
        /*
         * Split the libraries away from our own code.
         *
         * This doesn't make the first visit smaller — the same bytes arrive
         * either way. It makes every visit *after* a deploy smaller: React and
         * the animation library don't change when we ship a copy fix, so with
         * their own content-hashed chunks the browser keeps them and
         * re-downloads only the app. Before this, one changed line invalidated
         * all 160KB. On the mobile connections this audience is actually on,
         * that is the difference worth having.
         */
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-motion": ["motion/react"],
        },
      },
    },
  },
});
