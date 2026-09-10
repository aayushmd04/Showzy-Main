import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  API_BASE,
  ApiError,
  AUTH_EXPIRED_EVENT,
  get,
  getAllPages,
  logout,
  scanTicket,
  tokens,
} from "./api";

/**
 * The API client is the one module every screen depends on, and the two things
 * it does invisibly — refreshing an expired token and de-duplicating that
 * refresh — are the two things that sign a user out mid-purchase when they
 * break. Token rotation is on server-side, so a second refresh with an
 * already-rotated token invalidates the whole chain.
 */

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const url = (call: Parameters<typeof fetch>) => String(call[0]);
const headersOf = (call: Parameters<typeof fetch>) =>
  (call[1]?.headers ?? {}) as Record<string, string>;

function mockFetch(impl?: Parameters<FetchMock["mockImplementation"]>[0]): FetchMock {
  const fn = vi.fn<typeof fetch>();
  if (impl) fn.mockImplementation(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("api client", () => {
  beforeEach(() => {
    tokens.set("expired-access", "good-refresh");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  describe("token refresh", () => {
    it("refreshes once on a 401 and retries the original request with the new token", async () => {
      const fetchMock = mockFetch();
      fetchMock
        .mockResolvedValueOnce(json({ detail: "Given token not valid" }, 401))
        .mockResolvedValueOnce(json({ access: "fresh-access", refresh: "rotated-refresh" }))
        .mockResolvedValueOnce(json({ id: "u1", email: "rohan@example.com" }));

      await expect(get<{ id: string }>("/auth/me/")).resolves.toEqual({
        id: "u1",
        email: "rohan@example.com",
      });

      const calls = fetchMock.mock.calls;
      expect(calls).toHaveLength(3);
      expect(url(calls[1])).toBe(`${API_BASE}/auth/refresh/`);
      expect(url(calls[2])).toBe(`${API_BASE}/auth/me/`);
      expect(headersOf(calls[2]).Authorization).toBe("Bearer fresh-access");
      expect(tokens.access).toBe("fresh-access");
      expect(tokens.refresh).toBe("rotated-refresh");
    });

    it("keeps the existing refresh token when the server does not rotate one back", async () => {
      const fetchMock = mockFetch();
      fetchMock
        .mockResolvedValueOnce(json({ detail: "expired" }, 401))
        .mockResolvedValueOnce(json({ access: "fresh-access" }))
        .mockResolvedValueOnce(json({ ok: true }));

      await get("/auth/me/");

      expect(tokens.refresh).toBe("good-refresh");
    });

    it("fires exactly one refresh for ten concurrent 401s", async () => {
      let refreshCount = 0;
      let refreshed = false;
      const fetchMock = mockFetch(async (input) => {
        if (String(input).endsWith("/auth/refresh/")) {
          refreshCount += 1;
          refreshed = true;
          return json({ access: "fresh-access", refresh: "rotated-refresh" });
        }
        return refreshed ? json({ ok: true }) : json({ detail: "expired" }, 401);
      });

      const paths = Array.from({ length: 10 }, (_, i) => `/notifications/${i}/`);
      const results = await Promise.all(paths.map((p) => get<{ ok: boolean }>(p)));

      // A stampede here would burn nine rotated refresh tokens and sign the
      // user out; one refresh plus one retry each is the whole contract.
      expect(refreshCount).toBe(1);
      expect(results).toEqual(Array.from({ length: 10 }, () => ({ ok: true })));
      expect(fetchMock).toHaveBeenCalledTimes(21);
    });

    it("clears the tokens and announces the expiry when the refresh itself fails", async () => {
      const fetchMock = mockFetch();
      fetchMock
        .mockResolvedValueOnce(json({ detail: "Given token not valid" }, 401))
        .mockResolvedValueOnce(json({ detail: "Token is blacklisted" }, 401));

      const onExpired = vi.fn();
      window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);

      await expect(get("/auth/me/")).rejects.toBeInstanceOf(ApiError);

      expect(onExpired).toHaveBeenCalledTimes(1);
      expect(tokens.access).toBeNull();
      expect(tokens.refresh).toBeNull();
      window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
    });

    it("never retries the refresh call itself, so a dead session cannot loop", async () => {
      const fetchMock = mockFetch(async () => json({ detail: "expired" }, 401));

      await expect(get("/auth/me/")).rejects.toBeInstanceOf(ApiError);

      // The original request plus a single refresh attempt — nothing more.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(url(fetchMock.mock.calls[1])).toBe(`${API_BASE}/auth/refresh/`);
    });

    it("does not attempt a refresh for an unauthenticated request that 401s", async () => {
      const fetchMock = mockFetch(async () => json({ detail: "nope" }, 401));

      await expect(get("/events/", false)).rejects.toBeInstanceOf(ApiError);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(tokens.access).toBe("expired-access");
    });
  });

  describe("logout", () => {
    it("blacklists the refresh token server-side and clears local storage", async () => {
      const fetchMock = mockFetch(async () => json({ detail: "ok" }));

      await logout();

      expect(url(fetchMock.mock.calls[0])).toBe(`${API_BASE}/auth/logout/`);
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
        refresh: "good-refresh",
      });
      expect(tokens.access).toBeNull();
      expect(tokens.refresh).toBeNull();
    });

    it("still clears local storage when the blacklist call cannot reach the server", async () => {
      mockFetch(async () => {
        throw new TypeError("Failed to fetch");
      });

      await expect(logout()).resolves.toBeUndefined();

      expect(tokens.access).toBeNull();
      expect(tokens.refresh).toBeNull();
    });

    it("skips the network call entirely when there is no refresh token", async () => {
      tokens.clear();
      const fetchMock = mockFetch();

      await logout();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("getAllPages", () => {
    it("walks every page and stops when next is null", async () => {
      const fetchMock = mockFetch(async (input) =>
        String(input).includes("page=2")
          ? json({ results: ["c"], count: 3, next: null, previous: "x" })
          : json({ results: ["a", "b"], count: 3, next: "?page=2", previous: null }),
      );

      await expect(getAllPages<string>("/events/")).resolves.toEqual(["a", "b", "c"]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(url(fetchMock.mock.calls[0])).toBe(`${API_BASE}/events/?page=1`);
      expect(url(fetchMock.mock.calls[1])).toBe(`${API_BASE}/events/?page=2`);
    });

    it("stops at maxPages rather than following an endless next", async () => {
      const fetchMock = mockFetch(async () =>
        json({ results: ["x"], count: 999, next: "always", previous: null }),
      );

      await expect(getAllPages<string>("/artists/", false, 3)).resolves.toHaveLength(3);

      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it("appends the page parameter to a path that already has a query string", async () => {
      const fetchMock = mockFetch(async () =>
        json({ results: [], count: 0, next: null, previous: null }),
      );

      await getAllPages("/events/?city=bengaluru");

      expect(url(fetchMock.mock.calls[0])).toBe(`${API_BASE}/events/?city=bengaluru&page=1`);
    });
  });

  describe("scanTicket", () => {
    it("resolves with the rejection reason on a 400 so the door can show it", async () => {
      mockFetch(async () =>
        json({ valid: false, detail: "This ticket has already been used." }, 400),
      );

      await expect(scanTicket("QR-123")).resolves.toEqual({
        valid: false,
        detail: "This ticket has already been used.",
      });
    });

    it("still throws when the scan endpoint itself is broken", async () => {
      mockFetch(async () => json({ detail: "Server error" }, 500));

      await expect(scanTicket("QR-123")).rejects.toBeInstanceOf(ApiError);
    });
  });

  describe("error messages", () => {
    it.each([
      ["a DRF detail object", { detail: "You do not have permission." }, "You do not have permission."],
      ["a field-error object", { email: ["Enter a valid email address."] }, "Enter a valid email address."],
      ["a single-string field", { promo_code: "That code has expired." }, "That code has expired."],
    ])("reads a usable message out of %s", async (_label, body, expected) => {
      mockFetch(async () => json(body, 400));

      await expect(get("/ticket-orders/")).rejects.toMatchObject({
        status: 400,
        detail: expected,
      });
    });

    it("reads a usable message out of a plain-text error body", async () => {
      mockFetch(async () => new Response("Upstream timed out", { status: 502 }));

      await expect(get("/ticket-orders/")).rejects.toMatchObject({
        detail: "Upstream timed out",
      });
    });

    it("still raises an ApiError carrying the status when the body has nothing usable", async () => {
      mockFetch(async () => json({}, 500));

      // NOTE: the message here falls back to `res.statusText`, which is ""
      // over HTTP/2 — screens that render `err.detail` show a blank
      // explanation. Reported separately; not asserted, because pinning the
      // empty string would lock the gap in.
      await expect(get("/ticket-orders/")).rejects.toMatchObject({ status: 500 });
      await expect(get("/ticket-orders/")).rejects.toBeInstanceOf(ApiError);
    });
  });
});
