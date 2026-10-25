import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { AppStoreProvider, useStore } from "./app-store";
import {
  artists,
  bookings,
  events,
  gigApplications,
  tickets,
  venues,
} from "@/data/fixtures";

/*
 * The store starts empty in the app — a slow API must never show invented
 * gigs — so these tests seed it explicitly with the fixture data they assert
 * against. Deep-copied so one test's mutation cannot leak into the next.
 */
const seed = () => ({
  events: events.map((e) => ({ ...e, tiers: e.tiers.map((t) => ({ ...t })) })),
  artists: artists.map((a) => ({ ...a })),
  venues: venues.map((v) => ({ ...v })),
  bookings: bookings.map((b) => ({ ...b, quotes: b.quotes.map((q) => ({ ...q })) })),
  tickets: tickets.map((t) => ({ ...t })),
  applications: gigApplications.map((a) => ({ ...a })),
});

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider seed={seed()}>{children}</AppStoreProvider>;
}

function setup() {
  return renderHook(() => useStore(), { wrapper });
}

describe("app-store — admin / ops actions", () => {
  it("resolveDispute(release) marks the booking released with a resolution note", () => {
    const { result } = setup();
    const before = result.current.bookingById("b5");
    expect(before?.state).toBe("disputed");

    act(() => result.current.resolveDispute("b5", "release", "Reviewed evidence, gig happened."));

    const after = result.current.bookingById("b5");
    expect(after?.state).toBe("released");
    expect(after?.resolution).toMatchObject({
      outcome: "release",
      note: "Reviewed evidence, gig happened.",
    });
  });

  it("resolveDispute(refund) marks the booking cancelled", () => {
    const { result } = setup();
    act(() => result.current.resolveDispute("b5", "refund", "Artist no-show, full refund."));
    expect(result.current.bookingById("b5")?.state).toBe("cancelled");
  });

  it("only touches the disputed booking, not others", () => {
    const { result } = setup();
    const otherBefore = result.current.bookingById("b1");
    act(() => result.current.resolveDispute("b5", "release", "note"));
    expect(result.current.bookingById("b1")).toEqual(otherBefore);
  });

  it("setArtistKycStatus updates only the targeted artist", () => {
    const { result } = setup();
    expect(result.current.artistById("a3")?.kycStatus).toBe("pending");

    act(() => result.current.setArtistKycStatus("a3", "verified"));

    expect(result.current.artistById("a3")?.kycStatus).toBe("verified");
    expect(result.current.artistById("a5")?.kycStatus).toBe("pending"); // untouched
  });
});

describe("app-store — gig board", () => {
  it("applyToGig creates a pending application", () => {
    const { result } = setup();
    let created: ReturnType<typeof result.current.applyToGig>;
    act(() => {
      created = result.current.applyToGig("e2", "a1", "I'd love to open", 3000);
    });
    expect(created!.status).toBe("pending");
    expect(result.current.applications.some((a) => a.id === created!.id)).toBe(true);
  });

  it("setApplicationStatus updates only the targeted application", () => {
    const { result } = setup();
    const existing = result.current.applications.find((a) => a.id === "ga1")!;
    expect(existing.status).toBe("pending");

    act(() => result.current.setApplicationStatus("ga1", "declined"));

    expect(result.current.applications.find((a) => a.id === "ga1")?.status).toBe("declined");
  });
});
