/**
 * Cookie & storage consent.
 *
 * What Naada actually stores in your browser, and why (see /cookies):
 *
 *  - Strictly necessary — your sign-in token, the offline door-scan queue, an
 *    unsaved floor-plan draft, the consent choice itself. The site cannot work
 *    without these, so they need no consent and cannot be switched off.
 *  - Preferences — your language and light/dark theme. Optional: without your
 *    OK they last only until you close the tab.
 *
 * There are no advertising or analytics cookies, and nothing here loads a
 * third-party script. If analytics is ever added it must be a new category that
 * starts OFF and is gated behind `hasConsent()`.
 *
 * The choice is kept in a first-party cookie (readable by the server) for
 * twelve months, and re-asked whenever `CONSENT_VERSION` changes.
 */

import { useSyncExternalStore } from "react";

/** Bump when the categories or the cookie policy change in a way that needs a fresh OK. */
export const CONSENT_VERSION = 1;
export const CONSENT_COOKIE = "naada_consent";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const EVENT = "naada:consent";

export interface ConsentState {
  v: number;
  /** Remember language & theme beyond this tab. */
  preferences: boolean;
  /** ISO timestamp of the decision. */
  at: string;
}

function readCookie(): ConsentState | null {
  try {
    const hit = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
    if (!hit) return null;
    const parsed = JSON.parse(decodeURIComponent(hit.slice(CONSENT_COOKIE.length + 1)));
    if (parsed?.v !== CONSENT_VERSION || typeof parsed.preferences !== "boolean") return null;
    return parsed as ConsentState;
  } catch {
    return null;
  }
}

let snapshot: ConsentState | null = readCookie();

/** The current decision, or null if the visitor hasn't made one (or it is out of date). */
export function getConsent(): ConsentState | null {
  return snapshot;
}

export function hasConsent(category: "preferences"): boolean {
  return snapshot?.[category] === true;
}

export function setConsent(choice: { preferences: boolean }): ConsentState {
  const next: ConsentState = { v: CONSENT_VERSION, preferences: choice.preferences, at: new Date().toISOString() };
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(next))}; Max-Age=${MAX_AGE_SECONDS}; Path=/; SameSite=Lax${secure}`;
  } catch {
    /* cookies blocked: the choice lasts for this page view only */
  }
  snapshot = next;
  window.dispatchEvent(new Event(EVENT));
  return next;
}

/** Forget the decision (used by tests and by "reset my choices"). */
export function clearConsent(): void {
  try {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    /* nothing to do */
  }
  snapshot = null;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useConsent(): ConsentState | null {
  return useSyncExternalStore(subscribe, getConsent, () => null);
}

// ── Preference storage that respects the choice ──────────────────────────────

/** Read a preference: this tab's value wins, then the remembered one. */
export function readPref(key: string): string | null {
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Write a preference. With consent it persists; without, it lives only for this
 * tab, and any copy remembered earlier is removed so declining really forgets.
 */
export function writePref(key: string, value: string): void {
  try {
    if (hasConsent("preferences")) {
      localStorage.setItem(key, value);
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.setItem(key, value);
      localStorage.removeItem(key);
    }
  } catch {
    /* storage blocked — the choice just won't outlive the page */
  }
}

// ── Opening the preferences panel from anywhere (footer, settings…) ──────────

const OPEN_EVENT = "naada:open-cookie-settings";

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function onOpenCookieSettings(cb: () => void): () => void {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}
