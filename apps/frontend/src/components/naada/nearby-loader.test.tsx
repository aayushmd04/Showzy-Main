import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The opening screen asks the browser where the visitor is, once per visit, and keeps only the
 * nearest city's name. These tests stand in for the browser's location prompt.
 */

function stubLocation(impl: (ok: (p: unknown) => void, fail: (e: unknown) => void) => void) {
  const getCurrentPosition = vi.fn(impl);
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } });
  return getCurrentPosition;
}

async function mountLoader() {
  vi.resetModules();
  const { NearbyLoader } = await import("@/components/naada/nearby-loader");
  return render(<NearbyLoader />);
}

describe("opening screen location", () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.pushState({}, "", "/");
  });
  afterEach(() => cleanup());

  it("asks once and keeps the nearest city when the visitor allows it", async () => {
    const ask = stubLocation((ok) => ok({ coords: { latitude: 12.3, longitude: 76.64 } }));
    await mountLoader();
    expect(await screen.findByText(/finding events near you/i)).toBeTruthy();
    await waitFor(() => expect(sessionStorage.getItem("naada.nearbyCity")).toBe("Mysuru"));
    expect(ask).toHaveBeenCalledTimes(1);
  });

  it("does not ask again when the visitor has already chosen a city", async () => {
    sessionStorage.setItem("naada.nearbyCity", "Bengaluru");
    const ask = stubLocation((ok) => ok({ coords: { latitude: 12.3, longitude: 76.64 } }));
    await mountLoader();
    expect(await screen.findByText(/getting showzy ready/i)).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("naada.nearbyCity")).toBe("Bengaluru");
  });

  it("leaves the choice open when the visitor says no", async () => {
    const ask = stubLocation((_ok, fail) => fail({ code: 1, PERMISSION_DENIED: 1 }));
    await mountLoader();
    expect(await screen.findByText(/finding events near you/i)).toBeTruthy();
    await waitFor(() => expect(ask).toHaveBeenCalled());
    expect(sessionStorage.getItem("naada.nearbyCity")).toBeNull();
  });
});
