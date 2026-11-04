import type { Artist, NaadaEvent, Venue } from "@/data/fixtures";

export interface SearchSources {
  events: NaadaEvent[];
  artists: Artist[];
  venues: Venue[];
  /** The venue an event is held at. */
  venueOf: (event: NaadaEvent) => Venue | undefined;
}

export interface SearchResults {
  events: NaadaEvent[];
  artists: Artist[];
  venues: Venue[];
}

/** Lower-case, strip accents and punctuation noise so "Café" finds "cafe" and "stand-up" finds "stand up". */
export function normalise(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_.,'’"()&:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Every word the visitor typed has to appear somewhere in the haystack. */
function matches(haystack: string, terms: string[]): boolean {
  const h = normalise(haystack);
  return terms.every((t) => h.includes(t));
}

/**
 * One search across what a visitor can browse: nights, artists and rooms.
 *
 * Only public information is searched. An artist is found by name, genre and
 * city (never by fee or contact), a venue by name and area, a night by its name,
 * genres, venue and the artists on the bill.
 */
export function searchAll(query: string, { events, artists, venues, venueOf }: SearchSources): SearchResults {
  const terms = normalise(query).split(" ").filter(Boolean);
  if (terms.length === 0) return { events: [], artists: [], venues: [] };

  const artistName = new Map(artists.map((a) => [a.id, a.name]));

  return {
    events: events.filter((e) => {
      const v = venueOf(e);
      const lineup = e.lineup.map((id) => artistName.get(id) ?? "").join(" ");
      return matches(`${e.name} ${v?.name ?? ""} ${v?.area ?? ""} ${e.genres.join(" ")} ${lineup} ${e.description ?? ""}`, terms);
    }),
    artists: artists.filter((a) => matches(`${a.name} ${a.genres.join(" ")} ${a.city}`, terms)),
    venues: venues.filter((v) => matches(`${v.name} ${v.area}`, terms)),
  };
}
