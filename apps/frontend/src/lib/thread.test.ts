import { describe, expect, it } from "vitest";
import type { ApiConversation, ApiMessage, ApiOffer } from "./api";
import { findThread, offersIn, threadStatus } from "./thread";

const offer = (over: Partial<ApiOffer> = {}): ApiOffer => ({
  id: "o1",
  conversation: "c1",
  proposed_by: "host",
  fee_amount: "7500.00",
  performance_date: "2026-11-09",
  performance_duration_minutes: 90,
  set_count: 2,
  notes: "",
  status: "pending",
  expires_at: "2026-11-01T00:00:00Z",
  created_at: "2026-10-19T10:00:00Z",
  ...over,
});

const convo = (over: Partial<ApiConversation> = {}): ApiConversation => ({
  id: "c1",
  organizer: "org",
  organizer_name: "Fresh Hall",
  artist: "a1",
  artist_name: "Newbie Singer",
  created_at: "2026-10-19T10:00:00Z",
  ...over,
});

const message = (over: Partial<ApiMessage> = {}): ApiMessage => ({
  id: "m1",
  sender: "host",
  content: "hi",
  message_type: "text",
  is_flagged: false,
  created_at: "2026-10-19T10:00:00Z",
  ...over,
});

describe("findThread", () => {
  const rows = [convo({ id: "c1" }), convo({ id: "c2", order_id: "order-2" })];

  it("finds a thread by its own id", () => {
    expect(findThread(rows, "c1")?.id).toBe("c1");
  });

  it("finds the thread a booking came from by the booking's id", () => {
    expect(findThread(rows, "order-2")?.id).toBe("c2");
  });

  it("finds nothing for an id that is neither", () => {
    expect(findThread(rows, "nope")).toBeUndefined();
  });
});

describe("offersIn", () => {
  it("keeps only the offer cards, in thread order", () => {
    const messages = [
      message({ id: "m1" }),
      message({ id: "m2", message_type: "offer", offer: offer({ id: "o1" }) }),
      message({ id: "m3", message_type: "offer", offer: offer({ id: "o2" }) }),
      // An offer message whose offer was deleted has nothing to draw.
      message({ id: "m4", message_type: "offer", offer: null }),
    ];
    expect(offersIn(messages).map((o) => o.id)).toEqual(["o1", "o2"]);
  });
});

describe("threadStatus", () => {
  it("is booked once an offer was accepted", () => {
    expect(threadStatus(convo({ order_id: "order-1" }), [], "host").kind).toBe("booked");
  });

  it("waits on the other side when I made the standing offer", () => {
    const pending = offer({ proposed_by: "host" });
    expect(threadStatus(convo({ pending_offer: pending }), [pending], "host").kind).toBe("awaiting-them");
  });

  it("waits on me when the other side made it", () => {
    const pending = offer({ proposed_by: "host" });
    expect(threadStatus(convo({ pending_offer: pending }), [pending], "artist").kind).toBe("awaiting-you");
  });

  it("is closed when the last offer was turned down", () => {
    const declined = offer({ status: "rejected" });
    expect(threadStatus(convo(), [declined], "host")).toEqual({ kind: "closed", offer: declined });
  });

  it("is just chatting before any offer exists", () => {
    expect(threadStatus(convo(), [], "host").kind).toBe("chatting");
  });
});
