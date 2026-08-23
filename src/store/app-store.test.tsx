import { renderHook, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";
import { AppStoreProvider, useStore } from "./app-store";

function wrapper({ children }: { children: ReactNode }) {
  return <AppStoreProvider>{children}</AppStoreProvider>;
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

describe("app-store — chat", () => {
  it("sendMessage stores a clean message unflagged", () => {
    const { result } = setup();
    act(() => {
      result.current.sendMessage("b1", "host", "Can you do 8pm instead of 7?");
    });
    const thread = result.current.messagesFor("b1");
    const last = thread[thread.length - 1];
    expect(last.body).toBe("Can you do 8pm instead of 7?");
    expect(last.flagged).toBe(false);
  });

  it("sendMessage flags a message containing a phone number", () => {
    const { result } = setup();
    act(() => {
      result.current.sendMessage("b1", "artist", "call me on 9876543210");
    });
    const thread = result.current.messagesFor("b1");
    const last = thread[thread.length - 1];
    expect(last.flagged).toBe(true);
    expect(last.flagReason).toBe("phone number");
  });

  it("messagesFor returns only messages for that booking, oldest first", () => {
    const { result } = setup();
    const thread = result.current.messagesFor("b1");
    expect(thread.every((m) => m.bookingId === "b1")).toBe(true);
    const times = thread.map((m) => m.at);
    expect(times).toEqual([...times].sort());
  });

  it("reviewFlaggedMessage clears the flag without deleting the message", () => {
    const { result } = setup();
    const before = result.current.messages.find((m) => m.flagged);
    expect(before).toBeDefined();

    act(() => result.current.reviewFlaggedMessage(before!.id));

    const after = result.current.messages.find((m) => m.id === before!.id);
    expect(after).toBeDefined();
    expect(after?.flagged).toBe(false);
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

  it("sendBrief converts a matching pending application for that event/artist", () => {
    const { result } = setup();
    expect(result.current.applications.find((a) => a.id === "ga1")?.status).toBe("pending");

    act(() => {
      result.current.sendBrief({ eventId: "e2", artistId: "a6", amount: 3000, message: "Let's do it" });
    });

    expect(result.current.applications.find((a) => a.id === "ga1")?.status).toBe("converted");
  });

  it("sendBrief does not touch an application for a different artist or event", () => {
    const { result } = setup();
    act(() => {
      result.current.sendBrief({ eventId: "e3", artistId: "a5", amount: 4000, message: "Hi" });
    });
    expect(result.current.applications.find((a) => a.id === "ga1")?.status).toBe("pending");
  });
});

describe("app-store — reviews", () => {
  it("submitReview stores a review retrievable by booking", () => {
    const { result } = setup();
    act(() => {
      result.current.submitReview("b1", "artist_to_host", 4, "Great venue, smooth load-in.");
    });
    const forB1 = result.current.reviewsFor("b1");
    expect(forB1).toHaveLength(1);
    expect(forB1[0]).toMatchObject({ rating: 4, direction: "artist_to_host" });
  });

  it("reviewsFor only returns reviews for that booking", () => {
    const { result } = setup();
    const forB3 = result.current.reviewsFor("b3"); // fixture seed review
    const forB1 = result.current.reviewsFor("b1");
    expect(forB3).toHaveLength(1);
    expect(forB1).toHaveLength(0);
  });
});

describe("app-store — double-booking guard", () => {
  it("blocks accepting an offer for an artist already booked that date", () => {
    const { result } = setup();
    // b1 (a4, event e2) is already funded. Send a second brief for the same
    // artist on the same date via a different event, then try to accept it.
    act(() => {
      result.current.updateEvent("e3", { date: result.current.eventById("e2")!.date });
    });
    let clash: ReturnType<typeof result.current.sendBrief>;
    act(() => {
      clash = result.current.sendBrief({
        eventId: "e3",
        artistId: "a4",
        amount: 5000,
        message: "Also want you for this one",
      });
    });

    act(() => result.current.acceptBooking(clash!.id, "artist"));

    // Blocked — still requested, not accepted, and b1 is untouched.
    expect(result.current.bookingById(clash!.id)?.state).toBe("requested");
    expect(result.current.bookingById("b1")?.state).toBe("funded");
  });

  it("allows accepting when the artist is free that date", () => {
    const { result } = setup();
    act(() => result.current.acceptBooking("b4", "host")); // a3, no conflicting date
    expect(result.current.bookingById("b4")?.state).toBe("accepted");
  });
});
