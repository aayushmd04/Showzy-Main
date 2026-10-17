import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/fonts.css";
import "./styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/*
 * Registered in production only — a service worker in front of the dev server
 * turns every HMR update into a cache-staleness mystery.
 *
 * It exists for one moment: opening your ticket at a venue door, indoors, on
 * bad signal. It never caches payments, auth or check-in.
 */
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Unsupported or blocked — the app works exactly as before.
    });
  });
}
