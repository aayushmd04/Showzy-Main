/**
 * The five kinds of live art people browse by.
 *
 * Events carry free-form genre names ("Blues", "Open Mic", "Carnatic Fusion"),
 * not a category, so a category here is a set of words a genre can contain.
 * Matching on words rather than exact names means a new genre such as
 * "Kathak" or "Stand-up" lands in the right place with no code change.
 */
import { AudioLines, Brush, Drama, Footprints, MicVocal, type LucideIcon } from "lucide-react";

export type CategoryId = "music" | "drama" | "dance" | "comedy" | "art";

export interface Category {
  id: CategoryId;
  label: string;
  labelKn: string;
  icon: LucideIcon;
  words: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: "music",
    label: "Music",
    labelKn: "ಸಂಗೀತ",
    icon: AudioLines,
    words: [
      "music", "open mic", "blues", "jazz", "folk", "carnatic", "hindustani", "classical", "fusion",
      "rock", "indie", "pop", "band", "acoustic", "ghazal", "qawwali", "hip hop", "rap", "electronic",
    ],
  },
  {
    id: "drama",
    label: "Drama",
    labelKn: "ನಾಟಕ",
    icon: Drama,
    words: ["drama", "theatre", "theater", "play", "yakshagana", "street play", "mime", "monologue"],
  },
  {
    id: "dance",
    label: "Dance",
    labelKn: "ನೃತ್ಯ",
    icon: Footprints,
    words: [
      "dance", "bharatanatyam", "kathak", "kuchipudi", "odissi", "kathakali", "mohiniyattam",
      "manipuri", "sattriya", "contemporary", "folk dance",
    ],
  },
  {
    id: "comedy",
    label: "Comedy",
    labelKn: "ಹಾಸ್ಯ",
    icon: MicVocal,
    words: ["comedy", "stand-up", "standup", "stand up", "improv", "sketch"],
  },
  {
    id: "art",
    label: "Art",
    labelKn: "ಕಲೆ",
    icon: Brush,
    words: ["art", "poetry", "spoken word", "painting", "exhibition", "workshop", "craft", "photography", "storytelling"],
  },
];

/** True when any of an event's genres belongs to the category. */
export function inCategory(id: CategoryId, genres: string[]): boolean {
  const cat = CATEGORIES.find((c) => c.id === id);
  if (!cat) return false;
  return genres.some((g) => {
    const name = g.toLowerCase();
    return cat.words.some((w) => name.includes(w));
  });
}

/** The art form a genre belongs to, or null when it matches none of the five. */
export function categoryOf(genreName: string): Category | null {
  const name = genreName.toLowerCase();
  return CATEGORIES.find((c) => c.words.some((w) => name.includes(w))) ?? null;
}

export interface CategoryGroup<T> {
  category: Category | null;
  items: T[];
}

/**
 * Sort genres (or anything named like one) under their art form, in the site's
 * own category order, with anything unrecognised last. Lets a host or artist
 * choosing genres see "Drama: Theatre, Street Play" instead of one long list.
 */
export function groupByCategory<T>(items: T[], nameOf: (item: T) => string): CategoryGroup<T>[] {
  const groups = new Map<string, CategoryGroup<T>>();
  for (const item of items) {
    const category = categoryOf(nameOf(item));
    const key = category?.id ?? "other";
    if (!groups.has(key)) groups.set(key, { category, items: [] });
    groups.get(key)!.items.push(item);
  }
  const order = [...CATEGORIES.map((c) => c.id as string), "other"];
  return [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([, g]) => g);
}
