import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { usePageMeta, useNoIndex } from "./use-meta";
import { artistJsonLd, eventJsonLd, organizationJsonLd, toScript, venueJsonLd } from "./structured-data";
import { INSTAGRAM_URL, SITE_URL } from "./site";

const robots = () => document.head.querySelector('meta[name="robots"]')?.getAttribute("content");

function Page({ noindex, console: isConsole, ld }: { noindex?: boolean; console?: boolean; ld?: Record<string, unknown> }) {
  usePageMeta({ title: "T", noindex, jsonLd: ld });
  return isConsole ? <Shell /> : null;
}
function Shell() {
  useNoIndex();
  return null;
}

afterEach(() => cleanup());

describe("site facts", () => {
  it("uses the real domain and the Showzy Instagram handle", () => {
    expect(SITE_URL).toBe("https://showzy.in");
    expect(INSTAGRAM_URL).toBe("https://www.instagram.com/showzy.in/");
  });
  it("lists Instagram as the organisation's profile", () => {
    expect(JSON.stringify(organizationJsonLd())).toContain(INSTAGRAM_URL);
  });
});

describe("robots tag", () => {
  it("is indexable by default and noindex when the page asks", () => {
    const a = render(<Page />);
    expect(robots()).toContain("index, follow");
    a.unmount();
    render(<Page noindex />);
    expect(robots()).toBe("noindex, nofollow");
  });
  it("stays noindex for a console whatever order its effects run in", () => {
    const view = render(<Page console />);
    expect(robots()).toBe("noindex, nofollow");
    view.unmount();
    expect(robots()).toContain("index, follow");
  });
  it("points the canonical at the real domain without the query string", () => {
    window.history.pushState({}, "", "/whats-on?q=jazz");
    render(<Page />);
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://showzy.in/whats-on");
  });
});

describe("page JSON-LD", () => {
  it("adds one script for the page and removes it when the page is left", () => {
    const view = render(<Page ld={{ "@context": "https://schema.org", "@type": "Event", name: "X" }} />);
    expect(document.head.querySelectorAll('script[data-page="true"]')).toHaveLength(1);
    view.unmount();
    expect(document.head.querySelectorAll('script[data-page="true"]')).toHaveLength(0);
  });
  it("cannot be broken out of with a closing tag in a title", () => {
    expect(toScript({ name: "</script><b>" })).not.toContain("</script>");
  });
});

describe("structured data builders", () => {
  it("builds an event with place, performer and a price in rupees", () => {
    const ld = eventJsonLd({
      id: "1", title: "Jazz", start_datetime: "2026-12-01T19:00:00+05:30", min_price: 500, performers: ["Aria"],
      venue: { name: "Hall", address_line1: "1 Rd", city_name: "Mysuru" }, poster_image: "/p.png",
    }) as any;
    expect(ld["@type"]).toBe("Event");
    expect(ld.offers.priceCurrency).toBe("INR");
    expect(ld.offers.price).toBe("500");
    expect(ld.location.address.addressLocality).toBe("Mysuru");
    expect(ld.image[0]).toBe("https://showzy.in/p.png");
  });
  it("marks sold-out and cancelled events", () => {
    const base = { id: "1", title: "J", start_datetime: "2026-12-01T19:00:00Z", min_price: 100 };
    expect((eventJsonLd({ ...base, seats_left: 0 }) as any).offers.availability).toContain("SoldOut");
    expect((eventJsonLd({ ...base, status: "cancelled" }) as any).eventStatus).toContain("EventCancelled");
  });
  it("never puts an artist's fee or contact details in the markup", () => {
    const text = JSON.stringify(artistJsonLd({ id: "a", name: "Aria", bio: "Hi", instagram: "@aria", genres: ["Jazz"] }));
    expect(text).toContain("https://www.instagram.com/aria/");
    expect(text).not.toMatch(/fee|price|phone|email/i);
  });
  it("only claims a rating when real reviews exist", () => {
    const none = JSON.stringify(venueJsonLd({ slug: "h", name: "H", avg_rating: 5, review_count: 0 }));
    expect(none).not.toContain("aggregateRating");
    const some = JSON.stringify(venueJsonLd({ slug: "h", name: "H", avg_rating: 4.5, review_count: 12 }));
    expect(some).toContain("aggregateRating");
  });
  it("omits empty fields instead of emitting blanks", () => {
    const ld = venueJsonLd({ slug: "h", name: "H" }) as any;
    expect(ld.description).toBeUndefined();
    expect(ld.openingHoursSpecification).toBeUndefined();
  });
});
