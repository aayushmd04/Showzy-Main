import { useEffect } from "react";

const SITE = "Naada";
const DEFAULT_DESCRIPTION =
  "Grassroots live music in Mysuru and Bengaluru. Open mics, jam nights, pub gigs and classical evenings.";

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

export interface PageMeta {
  /** Page title, without the site name — that gets appended. */
  title?: string;
  description?: string;
  /** Absolute or root-relative image path for link previews. */
  image?: string;
  type?: "website" | "article" | "event";
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
export function usePageMeta({ title, description, image, type = "website" }: PageMeta) {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE}` : `${SITE} — live music in Mysuru & Bengaluru`;
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
    canonical.href = url.split("?")[0];
  }, [title, description, image, type]);
}
