/**
 * Product analytics (PostHog).
 *
 * Optional, and OFF until the visitor opts in: nothing is loaded, no request is made and no
 * cookie is set unless VITE_ANALYTICS_KEY is configured AND `hasConsent("analytics")`.
 * Withdrawing consent shuts it down and clears what it stored.
 *
 * Deliberately narrow: no autocapture (it records the text of what people click), no session
 * recording, no surveys, and no person profiles until someone is identified, which we never
 * do. Events are the ones named in `track()` calls, nothing else.
 */

import { hasConsent, onConsentChange } from "./consent";

type PostHog = typeof import("posthog-js").default;

const DEFAULT_HOST = "https://us.i.posthog.com";

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

function configured(): boolean {
  return Boolean(import.meta.env.VITE_ANALYTICS_KEY) && !import.meta.env.DEV;
}

async function load(): Promise<PostHog | null> {
  if (client) return client;
  loading ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(import.meta.env.VITE_ANALYTICS_KEY!, {
      api_host: import.meta.env.VITE_ANALYTICS_HOST || DEFAULT_HOST,
      autocapture: false,
      capture_pageview: false, // single-page app: pageviews are sent by `trackPageview`
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
      persistence: "localStorage+cookie",
      respect_dnt: true,
    });
    client = posthog;
    return posthog;
  }).catch(() => null); // blocked by an ad-blocker or offline: the app carries on without it
  return loading;
}

function stop() {
  if (!client) return;
  client.opt_out_capturing();
  client.reset();
}

/** Start or stop in step with the visitor's choice. Call once, at startup. */
export function initAnalytics(): void {
  if (!configured()) return;
  const sync = () => {
    if (hasConsent("analytics")) void load().then((ph) => ph?.opt_in_capturing());
    else stop();
  };
  sync();
  onConsentChange(sync);
}

export function trackPageview(path: string): void {
  track("$pageview", { $current_url: window.location.origin + path });
}

/** Never put names, emails, phone numbers or ticket codes in `props`. */
export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (!configured() || !hasConsent("analytics")) return;
  // First call after consent waits for the library to arrive, so the opening pageview isn't lost.
  void load().then((ph) => ph?.capture(event, props));
}
