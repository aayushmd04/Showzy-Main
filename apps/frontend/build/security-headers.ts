/**
 * Security headers and Content-Security-Policy, generated at build time.
 *
 * Why a build plugin and not a hand-written `_headers` file: the API's address is a
 * build-time variable (VITE_API_BASE) that differs per deploy, and the policy must name
 * it in `connect-src`, so a static file could only ever be right for one of them. The
 * one definition below feeds three outputs, so they cannot drift apart:
 *
 *   - `<meta http-equiv="Content-Security-Policy">` in index.html: works on every host,
 *     including ones where we cannot set response headers (Render static sites).
 *   - `dist/_headers`: read by Cloudflare (the production deploy, see wrangler.jsonc)
 *     and by Netlify. Adds what a <meta> tag cannot do: frame-ancestors, HSTS, etc.
 *   - `dist/security-headers.conf`: an nginx include for the Docker image.
 *
 * Inline scripts (the theme/splash snippet in index.html) are allowed by hash, computed
 * here from index.html itself, so editing that snippet cannot silently break the page.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Third parties the app loads on purpose. Anything not listed here is blocked. */
const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com"];
const GOOGLE_SIGN_IN = "https://accounts.google.com/gsi/";
const TURNSTILE = "https://challenges.cloudflare.com";
/** The venue map on an event page. Framed only after a guest clicks "Show map". */
const OPENSTREETMAP = "https://www.openstreetmap.org";
const DEFAULT_POSTHOG_HOST = "https://us.i.posthog.com";

/**
 * PostHog sends events to its ingest host and fetches extension scripts from a sibling
 * "-assets" host (us.i.posthog.com -> us-assets.i.posthog.com). A self-hosted or
 * reverse-proxied host has no assets sibling, so only the host itself is allowed.
 */
export function posthogOrigins(host: string): { connect: string[]; script: string[] } {
  const origin = originOf(host);
  if (!origin) return { connect: [], script: [] };
  const m = /^https:\/\/(us|eu)\.i\.posthog\.com$/.exec(origin);
  const assets = m ? [`https://${m[1]}-assets.i.posthog.com`] : [];
  return { connect: [origin, ...assets], script: assets };
}

export interface CspInput {
  /** Value of VITE_API_BASE, e.g. https://api.showzy.in/api/v1 */
  apiBase: string;
  /** Value of VITE_SENTRY_DSN_FRONTEND, if error reporting is on; its ingest origin joins connect-src. */
  sentryDsn?: string;
  /** PostHog host when analytics is configured (VITE_ANALYTICS_KEY set); else omitted. */
  analyticsHost?: string;
  /** `sha256-…` tokens for the inline scripts in index.html. */
  scriptHashes: string[];
  /**
   * <meta> CSP cannot carry `frame-ancestors` (browsers ignore it there and warn),
   * so it is only included in the real header form.
   */
  forHeader: boolean;
}

export function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null; // a relative base: same origin, already covered by 'self'
  }
}

export function buildCsp({ apiBase, scriptHashes, forHeader, sentryDsn, analyticsHost }: CspInput): string {
  const api = originOf(apiBase);
  const sentry = sentryDsn ? originOf(sentryDsn) : null;
  const posthog = analyticsHost ? posthogOrigins(analyticsHost) : { connect: [], script: [] };
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      ...scriptHashes.map((h) => `'${h}'`),
      RAZORPAY[0],
      GOOGLE_SIGN_IN,
      `${TURNSTILE}/turnstile/`,
      ...posthog.script,
    ],
    // Inline styles: React/motion set `style=""` attributes at runtime, which cannot be
    // hashed. Scripts are the injection risk that matters, and they stay strict.
    "style-src": ["'self'", "'unsafe-inline'", `${GOOGLE_SIGN_IN}style`],
    // Posters and photos come from the API or a storage bucket/CDN, so any https host.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      ...(api ? [api] : []),
      ...RAZORPAY,
      "https://lumberjack.razorpay.com",
      GOOGLE_SIGN_IN,
      TURNSTILE,
      ...(sentry ? [sentry] : []),
      ...posthog.connect,
    ],
    "frame-src": [...RAZORPAY, GOOGLE_SIGN_IN, TURNSTILE, OPENSTREETMAP],
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
  };
  if (forHeader) directives["frame-ancestors"] = ["'none'"];

  const parts = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only when the API is https: on a plain-http local build this would break every request.
  if (api?.startsWith("https://")) parts.push("upgrade-insecure-requests");
  return parts.join("; ");
}

/** Headers every response should carry, besides the CSP. */
export const BASELINE_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // The door scanner needs the camera and "nearby" needs location, for this origin only.
  "Permissions-Policy":
    "camera=(self), geolocation=(self), microphone=(), usb=(), bluetooth=(), serial=(), hid=(), " +
    "accelerometer=(), gyroscope=(), magnetometer=()",
  // No includeSubDomains / preload: that is a commitment for every subdomain, not for us to
  // make from a front-end build.
  "Strict-Transport-Security": "max-age=31536000",
};

/** `sha256-…` of every inline `<script>…</script>` (those without attributes) in the HTML. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) {
    hashes.push("sha256-" + createHash("sha256").update(match[1], "utf8").digest("base64"));
  }
  return hashes;
}

export function headersFile(csp: string): string {
  const lines = (h: Record<string, string>) => Object.entries(h).map(([k, v]) => `  ${k}: ${v}`).join("\n");
  return [
    "/*",
    `  Content-Security-Policy: ${csp}`,
    lines(BASELINE_HEADERS),
    "",
    "/assets/*",
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    // A cached service worker is how an old (or fixed) version stays stuck on phones.
    "/sw.js",
    "  Cache-Control: no-cache",
    "",
  ].join("\n");
}

export function nginxInclude(csp: string): string {
  const q = (v: string) => v.replace(/(["\\$])/g, "\\$1");
  const all = { "Content-Security-Policy": csp, ...BASELINE_HEADERS };
  return (
    "# Generated by build/security-headers.ts. Do not edit.\n" +
    Object.entries(all).map(([k, v]) => `add_header ${k} "${q(v)}" always;`).join("\n") +
    "\n"
  );
}

export function securityHeaders(options: Pick<CspInput, "apiBase" | "sentryDsn" | "analyticsHost">): Plugin {
  let hashes: string[] = [];
  return {
    name: "showzy-security-headers",
    // Dev server: the CSP would block Vite's HMR client and inline preamble.
    apply: "build",
    configResolved(config) {
      hashes = inlineScriptHashes(readFileSync(path.resolve(config.root, "index.html"), "utf8"));
    },
    transformIndexHtml() {
      const content = buildCsp({ ...options, scriptHashes: hashes, forHeader: false });
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content },
          injectTo: "head-prepend",
        },
      ];
    },
    generateBundle() {
      const csp = buildCsp({ ...options, scriptHashes: hashes, forHeader: true });
      this.emitFile({ type: "asset", fileName: "_headers", source: headersFile(csp) });
      this.emitFile({ type: "asset", fileName: "security-headers.conf", source: nginxInclude(csp) });
    },
  };
}
