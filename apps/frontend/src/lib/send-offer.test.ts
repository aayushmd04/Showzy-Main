import { afterEach, describe, expect, it, vi } from "vitest";
import { sendOfferToArtist, tokens } from "./api";

/**
 * "Send brief" used to build a booking inside the host's own browser and tell no
 * one, so the artist was never notified of anything. It now has to reach the
 * server: an organisation to book under, a conversation, then the offer itself.
 */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const input = {
  artistId: "artist-1",
  eventId: "event-1",
  organizerName: "Fresh Hall",
  feeAmount: 7500,
  performanceDate: "2026-11-09",
  notes: "Backline provided.",
};

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.clear();
});

function stubFetch(responses: Response[]) {
  const fn = vi.fn<typeof fetch>();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const calls = (fn: ReturnType<typeof stubFetch>) =>
  fn.mock.calls.map(([url, init]) => `${init?.method} ${String(url).replace(/^.*\/api\/v1/, "")}`);

describe("sendOfferToArtist", () => {
  it("makes an organisation for a host who has none, then opens the thread and sends the offer", async () => {
    tokens.set("a", "r");
    const fetchFn = stubFetch([
      json([]),
      json({ id: "org-1", name: "Fresh Hall" }, 201),
      json({ id: "convo-1" }, 201),
      json({ id: "offer-1", fee_amount: "7500.00" }, 201),
    ]);

    const offer = await sendOfferToArtist(input);

    expect(offer.id).toBe("offer-1");
    expect(calls(fetchFn)).toEqual([
      "GET /organizers/",
      "POST /organizers/",
      "POST /conversations/",
      "POST /conversations/convo-1/offer/",
    ]);
    expect(JSON.parse(String(fetchFn.mock.calls[1][1]?.body))).toMatchObject({ name: "Fresh Hall" });
    expect(JSON.parse(String(fetchFn.mock.calls[2][1]?.body))).toEqual({
      organizer: "org-1",
      artist: "artist-1",
      event: "event-1",
    });
    expect(JSON.parse(String(fetchFn.mock.calls[3][1]?.body))).toMatchObject({
      fee_amount: "7500",
      performance_date: "2026-11-09",
      notes: "Backline provided.",
    });
  });

  it("books under the organisation a host already has", async () => {
    tokens.set("a", "r");
    const fetchFn = stubFetch([
      json([{ id: "org-9", name: "Gokulam" }]),
      json({ id: "convo-2" }, 201),
      json({ id: "offer-2" }, 201),
    ]);

    await sendOfferToArtist(input);

    expect(calls(fetchFn)).toEqual([
      "GET /organizers/",
      "POST /conversations/",
      "POST /conversations/convo-2/offer/",
    ]);
  });

  it("rejects, rather than pretending, when the server refuses the offer", async () => {
    tokens.set("a", "r");
    stubFetch([json([{ id: "org-9" }]), json({ id: "convo-2" }, 201), json({ detail: "nope" }, 400)]);
    await expect(sendOfferToArtist(input)).rejects.toMatchObject({ status: 400 });
  });
});
