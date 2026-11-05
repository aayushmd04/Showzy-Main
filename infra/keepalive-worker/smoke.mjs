import worker, { targets } from "./index.js";

// Throws on a mismatch (the script then exits non-zero by itself).
const eq = (a, b, m) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`FAIL: ${m}\n  got      ${JSON.stringify(a)}\n  expected ${JSON.stringify(b)}`);
};

eq(targets({}), [], "no settings → nothing");
eq(targets({ API_BASE: "http://insecure.example" }), [], "http refused");
eq(targets({ API_BASE: "https://api.example.com/" }), ["https://api.example.com/api/v1/health/"], "health only");
eq(
  targets({ API_BASE: "https://api.example.com", ARTIST_ID: "1bbcf212-28ac-487a-809c-eec3174057a2" }),
  ["https://api.example.com/api/v1/health/", "https://api.example.com/api/v1/artists/1bbcf212-28ac-487a-809c-eec3174057a2/"],
  "health + artist",
);
eq(targets({ API_BASE: "https://api.example.com", ARTIST_ID: "../../admin" }), ["https://api.example.com/api/v1/health/"], "bad artist id ignored");

const seen = [];
globalThis.fetch = async (url, init) => { seen.push([url, init.headers["User-Agent"], init.redirect]); return new Response("{}", { status: 200 }); };
const res = await worker.fetch(new Request("https://w.example/?run=1"), { API_BASE: "https://api.example.com", ARTIST_ID: "1bbcf212-28ac-487a-809c-eec3174057a2" });
eq(res.status, 200, "run=1 ok");
eq(seen.length, 2, "two pings");
eq((await worker.fetch(new Request("https://w.example/"), {})).status, 200, "plain GET alive");

globalThis.fetch = async () => { throw new Error("boom"); };
const bad = await worker.fetch(new Request("https://w.example/?run=1"), { API_BASE: "https://api.example.com" });
eq(bad.status, 502, "failure reported as 502");
console.log("keepalive smoke test: all passed");
