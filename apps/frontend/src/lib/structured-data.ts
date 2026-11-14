/**
 * schema.org markup (JSON-LD) for the pages search engines index.
 *
 * Plain functions over plain data, with no React or browser APIs, so the page
 * code and the edge worker that answers crawlers build the same thing.
 *
 * Only public facts go in: an event's time, place and ticket price (all on the
 * public page already), an artist's name, genres and links, a venue's address.
 * Never an artist's fee or availability, a venue's contact details or anything
 * else the site withholds from signed-out visitors.
 */

import { INSTAGRAM_URL, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site";

export type JsonLd = Record<string, unknown>;

const abs = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  try {
    return new URL(url, SITE_URL).href;
  } catch {
    return undefined;
  }
};

/** Drop empty values so the markup stays valid (search engines reject empty strings and nulls). */
function clean<T extends JsonLd>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) delete obj[key];
  }
  return obj;
}

export function organizationJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        sameAs: [INSTAGRAM_URL],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        description: SITE_DESCRIPTION,
        inLanguage: "en-IN",
        publisher: { "@id": `${SITE_URL}/#organization` },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${SITE_URL}/whats-on?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

export function breadcrumbJsonLd(trail: Array<{ name: string; path: string }>): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: t.name,
      item: `${SITE_URL}${t.path}`,
    })),
  };
}

export interface EventInput {
  id: string;
  title: string;
  description?: string;
  start_datetime: string;
  end_datetime?: string;
  status?: string;
  poster_image?: string | null;
  is_free?: boolean;
  venue?: {
    name: string;
    address_line1?: string;
    address_line2?: string;
    pincode?: string;
    area_name?: string;
    city_name?: string;
  } | null;
  /** The cheapest ticket, in rupees. */
  min_price?: number | null;
  seats_left?: number | null;
  performers?: string[];
}

export function eventJsonLd(e: EventInput): JsonLd {
  const cancelled = e.status === "cancelled";
  const soldOut = e.status === "sold_out" || e.seats_left === 0;
  const free = e.is_free || e.min_price === 0;
  return clean({
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${SITE_URL}/e/${e.id}#event`,
    name: e.title,
    description: e.description?.slice(0, 500),
    startDate: e.start_datetime,
    endDate: e.end_datetime,
    eventStatus: cancelled ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: abs(e.poster_image) ? [abs(e.poster_image)] : undefined,
    url: `${SITE_URL}/e/${e.id}`,
    location: e.venue
      ? clean({
          "@type": "Place",
          name: e.venue.name,
          address: clean({
            "@type": "PostalAddress",
            streetAddress: [e.venue.address_line1, e.venue.address_line2].filter(Boolean).join(", "),
            addressLocality: e.venue.city_name,
            postalCode: e.venue.pincode,
            addressCountry: "IN",
          }),
        })
      : undefined,
    performer: e.performers?.length ? e.performers.map((name) => ({ "@type": "PerformingGroup", name })) : undefined,
    organizer: { "@id": `${SITE_URL}/#organization` },
    offers:
      e.min_price !== undefined && e.min_price !== null
        ? clean({
            "@type": "Offer",
            url: `${SITE_URL}/e/${e.id}`,
            price: String(free ? 0 : e.min_price),
            priceCurrency: "INR",
            availability: soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
          })
        : undefined,
  });
}

export interface ArtistInput {
  id: string;
  name: string;
  bio?: string;
  genres?: string[];
  city?: string;
  image?: string | null;
  instagram?: string;
  website?: string;
}

export function artistJsonLd(a: ArtistInput): JsonLd {
  const handle = (a.instagram ?? "").replace(/^@/, "").trim();
  const instagram = handle ? (/^https?:\/\//i.test(handle) ? handle : `https://www.instagram.com/${handle}/`) : undefined;
  return clean({
    "@context": "https://schema.org",
    "@type": "PerformingGroup",
    "@id": `${SITE_URL}/a/${a.id}#artist`,
    name: a.name,
    description: a.bio?.slice(0, 500),
    genre: a.genres,
    image: abs(a.image),
    url: `${SITE_URL}/a/${a.id}`,
    homeLocation: a.city ? { "@type": "Place", name: a.city } : undefined,
    sameAs: [instagram, a.website].filter(Boolean),
  });
}

export interface VenueInput {
  slug: string;
  name: string;
  description?: string;
  image?: string | null;
  address_line1?: string;
  address_line2?: string;
  pincode?: string;
  area_name?: string;
  city_name?: string;
  capacity?: number;
  avg_rating?: number | null;
  review_count?: number;
  hours?: Array<{ day_of_week: number; open_time: string; close_time: string; is_closed: boolean }>;
  mapUrl?: string;
}

const DAY = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function venueJsonLd(v: VenueInput): JsonLd {
  const hours = (v.hours ?? [])
    .filter((h) => !h.is_closed)
    .map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: DAY[h.day_of_week],
      opens: h.open_time.slice(0, 5),
      closes: h.close_time.slice(0, 5),
    }));
  return clean({
    "@context": "https://schema.org",
    "@type": ["PerformingArtsTheater", "LocalBusiness"],
    "@id": `${SITE_URL}/v/${v.slug}#venue`,
    name: v.name,
    description: v.description?.slice(0, 500),
    image: abs(v.image),
    url: `${SITE_URL}/v/${v.slug}`,
    address: clean({
      "@type": "PostalAddress",
      streetAddress: [v.address_line1, v.address_line2].filter(Boolean).join(", "),
      addressLocality: v.city_name,
      postalCode: v.pincode,
      addressCountry: "IN",
    }),
    maximumAttendeeCapacity: v.capacity || undefined,
    hasMap: v.mapUrl,
    openingHoursSpecification: hours,
    // Only when real attendees have rated it: invented ratings are a guideline violation.
    aggregateRating:
      v.avg_rating && v.review_count
        ? { "@type": "AggregateRating", ratingValue: v.avg_rating, reviewCount: v.review_count, bestRating: 5 }
        : undefined,
  });
}

/** Serialise for a <script type="application/ld+json">. `<` is escaped so a title can never close the tag. */
export function toScript(data: JsonLd): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
