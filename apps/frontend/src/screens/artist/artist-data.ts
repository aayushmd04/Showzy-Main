/**
 * Artist-side data helpers.
 *
 * `src/lib/api.ts` already carries the artist calls the whole app shares
 * (`getMyArtistProfile`, `getArtist`, `updateArtist`, `followArtist`). What
 * lives here is artist-console-specific: the richer response shape the detail
 * endpoint actually returns, the photo endpoints, and the copy we put in front
 * of a user when one of them fails.
 */

import { ApiError, get, post, tokens, updateArtist } from "@/lib/api";
import type { ApiArtist, ArtistWritePayload } from "@/lib/api";

/** `Artist.availability` — always both keys, server-normalised. */
export interface Availability {
  blackout_dates: string[];
  notes: string;
}

export interface ArtistPhoto {
  id: number;
  image: string;
  caption: string;
  is_primary: boolean;
  sort_order: number;
}

/**
 * What `/artists/<id>/` and `/artists/mine/` return. `ApiArtist` describes the
 * list endpoint's narrower shape; the detail serializer adds photos, links,
 * availability and follow state on top of it.
 */
export interface ArtistDetail extends ApiArtist {
  city?: number | null;
  genres: Array<{ id: number; name: string; slug?: string }>;
  photos: ArtistPhoto[];
  availability: Availability;
  is_following: boolean;
  follower_count: number;
  is_verified: boolean;
  instagram: string;
  youtube: string;
  website: string;
  booking_fee_min?: string | null;
  booking_fee_max?: string | null;
}

/**
 * Load a public artist page.
 *
 * `getArtist()` in api.ts is deliberately anonymous, which makes the server's
 * `is_following` false for everyone — a signed-in follower would see "Follow"
 * again after every reload. Send the token whenever there is one.
 */
export function loadArtist(id: string): Promise<ArtistDetail> {
  return get<ArtistDetail>(`/artists/${id}/`, Boolean(tokens.access));
}

export const EMPTY_AVAILABILITY: Availability = { blackout_dates: [], notes: "" };

/** Never trust a half-migrated row to carry both keys. */
export function readAvailability(value: unknown): Availability {
  if (!value || typeof value !== "object") return EMPTY_AVAILABILITY;
  const raw = value as Partial<Availability>;
  return {
    blackout_dates: Array.isArray(raw.blackout_dates) ? raw.blackout_dates : [],
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

/**
 * The write shape the API accepts. `ArtistWritePayload` in api.ts types the
 * clearable fields as plain strings; the server accepts `null` to unset them,
 * which is the only way to empty a fee range once it has been set.
 */
export interface ArtistProfileWrite {
  stage_name: string;
  bio: string;
  city: string | null;
  genres: number[];
  fee_range_min: string | null;
  fee_range_max: string | null;
  instagram: string;
  youtube: string;
  website: string;
  availability: Availability;
}

export function saveArtistProfile(
  id: string,
  data: ArtistProfileWrite,
): Promise<ArtistDetail> {
  return updateArtist(id, data as unknown as ArtistWritePayload) as Promise<ArtistDetail>;
}

/** Create the row for an account whose artist profile was never made. */
export function createArtistProfile(stageName: string): Promise<ArtistDetail> {
  return post<ArtistDetail>("/artists/", { stage_name: stageName });
}

export function uploadArtistPhoto(
  artistId: string,
  file: File,
  caption = "",
): Promise<ArtistPhoto> {
  const form = new FormData();
  form.append("image", file);
  if (caption) form.append("caption", caption);
  return post<ArtistPhoto>(`/artists/${artistId}/photos/`, form);
}

export function setPrimaryArtistPhoto(
  artistId: string,
  photoId: number,
): Promise<ArtistPhoto> {
  return post<ArtistPhoto>(`/artists/${artistId}/photos/${photoId}/primary/`);
}

export function deleteArtistPhoto(artistId: string, photoId: number): Promise<null> {
  return post<null>(`/artists/${artistId}/photos/${photoId}/delete/`);
}

/** 5 MB — big enough for a phone photo, small enough not to stall on 4G. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Returns a message to show, or null when the file is fine to send. */
export function rejectPhoto(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `${file.name} is a ${file.type || "unknown"} file. Upload a JPG, PNG or WebP.`;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    return `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB — try a smaller export.`;
  }
  return null;
}

/**
 * Turn whatever a failed call threw into a sentence that says what happened
 * and what to do about it. Never surfaces a raw exception.
 */
export function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return "Your session ended. Sign in again and your changes will save.";
    }
    if (err.status === 403) {
      return "This profile belongs to another account. Sign in as its owner to change it.";
    }
    if (err.status === 404) {
      return "That profile is no longer on Naada.";
    }
    if (err.status === 413) {
      return "That file is too large for the server. Try an image under 5 MB.";
    }
    if (err.status >= 500) {
      return "Naada's server couldn't complete that. Wait a moment and try again.";
    }
    return err.detail;
  }
  if (err instanceof TypeError) {
    return "Couldn't reach Naada. Check your connection and try again.";
  }
  return fallback;
}

export function isMissingProfile(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

/** `₹4,000` from the decimal strings the API sends, or null when unset. */
export function feeNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : null;
}

/** ISO date for today, in the browser's own timezone. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** `14 Aug 2026` — availability dates carry a year, unlike listing dates. */
export function availabilityDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${String(d).padStart(2, "0")} ${months[m - 1]} ${y}`;
}
