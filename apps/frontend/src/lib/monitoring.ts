/**
 * Browser error reporting (Sentry).
 *
 * Off unless VITE_SENTRY_DSN_FRONTEND is set. Error reporting is "strictly necessary" for keeping the
 * site working, so it does not wait for cookie consent, but it is kept to what that needs:
 * no session replay, no default PII, no IP address, and it sets no cookies.
 */

import * as Sentry from "@sentry/react";

let started = false;

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN_FRONTEND;
  if (started || !dsn || import.meta.env.DEV) return;
  started = true;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || "production",
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    // SDK 11 collects headers, cookies and query strings unless told not to.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    // Errors we cannot act on: an expired session is handled in the UI, and extensions
    // or a flaky connection are not our bugs.
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Failed to fetch",
      "Load failed",
      "NetworkError when attempting to fetch resource.",
    ],
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//, /^safari-extension:\/\//],
    beforeSend(event) {
      // Query strings can carry tokens (ticket links, sign-in codes). Keep the path only.
      if (event.request?.url) event.request.url = event.request.url.split("?")[0];
      return event;
    },
  });

  // ErrorBoundary swallows render errors and re-announces them here.
  window.addEventListener("naada:render-error", (e) => {
    const { error, info } = (e as CustomEvent<{ error: Error; info: { componentStack?: string | null } }>).detail;
    Sentry.captureException(error, { contexts: { react: { componentStack: info.componentStack ?? "" } } });
  });
}
