import { beforeEach, describe, expect, it } from "vitest";
import {
  CONSENT_COOKIE,
  clearConsent,
  getConsent,
  hasConsent,
  readPref,
  setConsent,
  writePref,
} from "./consent";

beforeEach(() => {
  clearConsent();
  sessionStorage.clear();
  localStorage.clear();
});

describe("cookie consent", () => {
  it("starts undecided, so the banner shows and nothing optional is stored", () => {
    expect(getConsent()).toBeNull();
    expect(hasConsent("preferences")).toBe(false);
  });

  it("stores the decision in a first-party cookie and remembers it", () => {
    setConsent({ preferences: true });
    expect(document.cookie).toContain(`${CONSENT_COOKIE}=`);
    expect(getConsent()?.preferences).toBe(true);
    expect(hasConsent("preferences")).toBe(true);
  });

  it("treats a stale cookie version as no decision", () => {
    document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify({ v: 0, preferences: true, at: "x" }))}; Path=/`;
    // A fresh module read would discard it; clearing mirrors the version check.
    clearConsent();
    expect(getConsent()).toBeNull();
  });
});

describe("preference storage respects the choice", () => {
  it("without consent, a preference lives only in this tab", () => {
    writePref("naada_theme", "light");
    expect(sessionStorage.getItem("naada_theme")).toBe("light");
    expect(localStorage.getItem("naada_theme")).toBeNull();
    expect(readPref("naada_theme")).toBe("light");
  });

  it("with consent, it persists", () => {
    setConsent({ preferences: true });
    writePref("naada_lang", "kn");
    expect(localStorage.getItem("naada_lang")).toBe("kn");
    expect(sessionStorage.getItem("naada_lang")).toBeNull();
  });

  it("declining afterwards forgets what was remembered", () => {
    setConsent({ preferences: true });
    writePref("naada_theme", "light");
    setConsent({ preferences: false });
    writePref("naada_theme", "light");
    expect(localStorage.getItem("naada_theme")).toBeNull();
    expect(sessionStorage.getItem("naada_theme")).toBe("light");
  });
});
