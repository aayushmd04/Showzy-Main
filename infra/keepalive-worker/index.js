/**
 * Showzy keep-alive.
 *
 * Why this exists: the API runs on a free Render web service, which goes to
 * sleep after ~15 minutes without an incoming HTTP request. The first visitor
 * after that waits up to a minute for it to wake. This Worker is that
 * "incoming request", sent on a schedule.
 *
 * What it must hit: the API itself. The website (showzy.in) is static files on
 * Cloudflare; fetching a page such as https://showzy.in/a/<id> returns the same
 * index.html for every address and never reaches Render. The artist page only
 * calls the API later, from the visitor's browser.
 *
 * Settings (Worker -> Settings -> Variables), not hard-coded:
 *   API_BASE   e.g. https://naada-api.onrender.com        (no trailing slash)
 *   ARTIST_ID  optional: an artist id; its profile is fetched as well, which
 *              also touches the database so Supabase stays awake too.
 *
 * Trigger: every 10 minutes (set in wrangler.jsonc, or Worker -> Settings ->
 * Triggers -> Cron, expression: star-slash-10 in the minutes field). That is
 * safely inside Render's 15-minute sleep window.
 * Do not use a longer or randomised gap: a 13-minute gap that lands on a
 * 15-minute tick is a 15-minute gap, and the service has already slept.
 */

/** A cold Render service can take about a minute to answer its first request. */
const TIMEOUT_MS = 75_000;

async function ping(url) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": "showzy-keepalive/2.0", Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    // Drain the body so the connection is released; we only care that it answered.
    await res.arrayBuffer();
    return { url, ok: res.ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { url, ok: false, status: 0, ms: Date.now() - started, error: String(err && err.message ? err.message : err) };
  }
}

/** The URLs to hit for these settings. Exported for the smoke test. */
export function targets(env) {
  const base = (env.API_BASE || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[^/\s]+$/.test(base)) return [];
  const urls = [`${base}/api/v1/health/`];
  const artist = (env.ARTIST_ID || "").trim();
  if (/^[0-9a-f-]{36}$/i.test(artist)) urls.push(`${base}/api/v1/artists/${artist}/`);
  return urls;
}

async function run(env) {
  const urls = targets(env);
  if (urls.length === 0) {
    console.error("API_BASE is missing or not an https address (e.g. https://naada-api.onrender.com). Nothing to ping.");
    return [];
  }
  // One after the other: the health check wakes the service, then the profile
  // request is answered quickly instead of both racing a cold start.
  const results = [];
  for (const url of urls) results.push(await ping(url));
  for (const r of results) {
    const line = `${r.ok ? "OK  " : "FAIL"} ${r.status} ${r.ms}ms ${r.url}${r.error ? " — " + r.error : ""}`;
    (r.ok ? console.log : console.error)(line);
  }
  return results;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(run(env));
  },

  // Visit the Worker's address to see it is alive; add ?run=1 to ping right now
  // (handy right after changing settings). Nothing here reveals the API address.
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.searchParams.get("run") === "1") {
      const results = await run(env);
      return Response.json(
        results.map(({ status, ms, ok }, i) => ({ target: i === 0 ? "health" : "artist", ok, status, ms })),
        { status: results.length && results.every((r) => r.ok) ? 200 : 502 },
      );
    }
    return new Response("showzy keep-alive is running", { status: 200 });
  },
};
