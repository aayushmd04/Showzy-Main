import { useEffect } from "react";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "./site";
import { toScript, type JsonLd } from "./structured-data";

const SITE = SITE_NAME;
const DEFAULT_DESCRIPTION = SITE_DESCRIPTION;

function setTag(selector: string, attr: "content", value: string, create: () => HTMLMetaElement) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function setMeta(name: string, value: string) {
  setTag(`meta[name="${name}"]`, "content", value, () => {
    const m = document.createElement("meta");
    m.setAttribute("name", name);
    return m;
  });
}

function setProperty(property: string, value: string) {
  setTag(`meta[property="${property}"]`, "content", value, () => {
    const m = document.createElement("meta");
    m.setAttribute("property", property);
    return m;
  });
}

const ROBOTS_INDEX = "index, follow, max-image-preview:large";
const ROBOTS_NOINDEX = "noindex, nofollow";
// The robots tag is decided from two inputs that mount in unpredictable order
// (a page's own `noindex` and the console shell's `useNoIndex`), so both feed
// one place rather than each writing the tag and overwriting the other.
let pageNoindex = false;
let forcedNoindex = 0;
function applyRobots() {
  setMeta("robots", pageNoindex || forcedNoindex > 0 ? ROBOTS_NOINDEX : ROBOTS_INDEX);
}

export interface PageMeta {
  /** Page title, without the site name — that gets appended. */
  title?: string;
  description?: string;
  /** Absolute or root-relative image path for link previews. */
  image?: string;
  type?: "website" | "article" | "event";
  /** Keep this page out of search results (private, thin or error pages). */
  noindex?: boolean;
  /** schema.org markup for this page; removed again when the page is left. */
  jsonLd?: JsonLd | null;
}

/**
 * Per-route title and link-preview tags.
 *
 * Every page shipped the same static title, so browser tabs, history entries
 * and shared links were indistinguishable — a gig link previewed as the generic
 * site name with no date, venue or poster.
 *
 * A caveat worth knowing: this runs in the browser, so search engines that
 * execute JavaScript will see it but most social scrapers will not. Correct
 * previews everywhere need the prerender step described in DEPLOY.md; this is
 * the half that works without any build change.
 */
export function usePageMeta({ title, description, image, type = "website", noindex = false, jsonLd }: PageMeta) {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE}` : `${SITE}: ${SITE_TAGLINE}`;
    const desc = description?.trim() || DEFAULT_DESCRIPTION;
    const url = window.location.href;
    // No page image means the branded card, never the previous page's poster.
    const absoluteImage = new URL(image || "/og-image.png", window.location.origin).href;

    document.title = fullTitle;
    setMeta("description", desc);

    setProperty("og:title", fullTitle);
    setProperty("og:description", desc);
    setProperty("og:type", type === "event" ? "article" : type);
    setProperty("og:site_name", SITE);
    setProperty("og:url", url);

    setMeta("twitter:card", absoluteImage ? "summary_large_image" : "summary");
    setMeta("twitter:title", fullTitle);
    setMeta("twitter:description", desc);

    if (absoluteImage) {
      setProperty("og:image", absoluteImage);
      setMeta("twitter:image", absoluteImage);
    }

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    // One address per page, on the real domain: not `www.`, not a preview URL, not a ?q= variant.
    canonical.href = `${SITE_URL}${window.location.pathname}`.replace(/\/+$/, "") || SITE_URL;
    setProperty("og:url", canonical.href);
    pageNoindex = noindex;
    applyRobots();
  }, [title, description, image, type, noindex]);

  const ld = jsonLd ? toScript(jsonLd) : "";
  useEffect(() => {
    if (!ld) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.dataset.page = "true";
    el.textContent = ld;
    document.head.appendChild(el);
    return () => el.remove();
  }, [ld]);
}

/** Mark the current screen as not for search engines while it is mounted (consoles, account pages). */
export function useNoIndex(): void {
  useEffect(() => {
    forcedNoindex += 1;
    applyRobots();
    return () => {
      forcedNoindex -= 1;
      applyRobots();
    };
  }, []);
}
