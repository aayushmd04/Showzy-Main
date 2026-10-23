import { describe, expect, it } from "vitest";
import {
  BASELINE_HEADERS,
  buildCsp,
  headersFile,
  inlineScriptHashes,
  nginxInclude,
  originOf,
} from "./security-headers";

const HASH = "sha256-abc123=";
const prod = { apiBase: "https://api.showzy.in/api/v1", scriptHashes: [HASH], forHeader: true };

describe("buildCsp", () => {
  it("allows only the app's own scripts plus the three third parties it loads", () => {
    const csp = buildCsp(prod);
    const scripts = csp.split("; ").find((d) => d.startsWith("script-src "))!;
    expect(scripts).toContain("'self'");
    expect(scripts).toContain("https://checkout.razorpay.com");
    expect(scripts).toContain("https://accounts.google.com/gsi/");
    expect(scripts).toContain("https://challenges.cloudflare.com/turnstile/");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
    expect(scripts).not.toMatch(/\*/);
  });

  it("allows the inline theme script by hash, not by 'unsafe-inline'", () => {
    expect(buildCsp(prod)).toContain(`'${HASH}'`);
  });

  it("lets the app call its own API origin, and no other site", () => {
    const connect = buildCsp(prod).split("; ").find((d) => d.startsWith("connect-src "))!;
    expect(connect).toContain("https://api.showzy.in");
    expect(connect).not.toContain("/api/v1"); // origins only, not paths
    expect(connect).not.toContain("https: ");
  });

  it("locks down plugins, base tag, forms and framing", () => {
    const csp = buildCsp(prod);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("leaves frame-ancestors out of the <meta> form, where browsers ignore it", () => {
    expect(buildCsp({ ...prod, forHeader: false })).not.toContain("frame-ancestors");
  });

  it("upgrades insecure requests only when the API is https", () => {
    expect(buildCsp(prod)).toContain("upgrade-insecure-requests");
    const local = buildCsp({ ...prod, apiBase: "http://localhost:8000/api/v1" });
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(local).toContain("http://localhost:8000");
  });

  it("copes with a relative API base", () => {
    const csp = buildCsp({ ...prod, apiBase: "/api/v1" });
    expect(csp).toContain("connect-src 'self' https://checkout.razorpay.com");
  });

  it("stays well under Cloudflare's 2,000-character limit per header line", () => {
    expect(buildCsp(prod).length).toBeLessThan(1500);
  });
});

describe("originOf", () => {
  it("returns the origin for absolute URLs and null for relative ones", () => {
    expect(originOf("https://a.example/x/y")).toBe("https://a.example");
    expect(originOf("/api/v1")).toBeNull();
  });
});

describe("inlineScriptHashes", () => {
  it("hashes inline scripts and ignores external and module ones", () => {
    const html =
      '<script>var a = 1;</script><script type="module" src="/x.js"></script><script src="/y.js"></script>';
    const hashes = inlineScriptHashes(html);
    expect(hashes).toHaveLength(1);
    expect(hashes[0]).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
  });

  it("changes when the script changes", () => {
    expect(inlineScriptHashes("<script>a</script>")).not.toEqual(inlineScriptHashes("<script>b</script>"));
  });
});

describe("output files", () => {
  it("_headers carries the CSP and baseline headers for every path", () => {
    const file = headersFile("default-src 'self'");
    expect(file.startsWith("/*\n")).toBe(true);
    expect(file).toContain("Content-Security-Policy: default-src 'self'");
    for (const name of Object.keys(BASELINE_HEADERS)) expect(file).toContain(`${name}: `);
  });

  it("the nginx include escapes quotes so the directive stays valid", () => {
    const conf = nginxInclude('x "y"; z');
    expect(conf).toContain('add_header Content-Security-Policy "x \\"y\\"; z" always;');
    expect(conf.trim().split("\n").filter((l) => l.startsWith("add_header"))).toHaveLength(
      1 + Object.keys(BASELINE_HEADERS).length,
    );
  });

  it("keeps the camera and location the app needs, for itself only", () => {
    expect(BASELINE_HEADERS["Permissions-Policy"]).toContain("camera=(self)");
    expect(BASELINE_HEADERS["Permissions-Policy"]).toContain("geolocation=(self)");
    expect(BASELINE_HEADERS["Permissions-Policy"]).toContain("microphone=()");
  });
});
