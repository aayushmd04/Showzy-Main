import { get, tokens } from "@/lib/api";
import type { ApiEvent, ApiVenue } from "@/lib/api";

/** One row of `EventReview`, exactly as the event detail endpoint returns it. */
export interface EventReview {
  id: string;
  reviewer_name: string;
  reviewer_avatar: string | null;
  rating: number;
  comment: string;
  is_verified_attendee: boolean;
  /** True only on the signed-in viewer's own review — names are not identity. */
  is_mine: boolean;
  created_at: string;
}

/**
 * What `/events/<id>/` actually returns.
 *
 * `ApiEvent` describes the list endpoint's narrower shape — there, `venue` is a
 * bare id and `ticket_tiers` is absent. The detail serializer nests the venue,
 * sends the real tiers, and adds the reviews and this viewer's save state.
 */
export interface EventDetail extends ApiEvent {
  venue: ApiVenue;
  end_datetime: string;
  doors_open_at: string | null;
  reviews: EventReview[];
  is_saved: boolean;
  organizer_name: string;
}

/**
 * Load an event page.
 *
 * `getEvent()` in api.ts is deliberately anonymous, which makes the server's
 * `is_saved` and `is_mine` false for everybody. Send the token when there is
 * one, so a signed-in reader sees their own state.
 */
export function loadEventDetail(id: string): Promise<EventDetail> {
  return get<EventDetail>(`/events/${id}/`, Boolean(tokens.access));
}

/** Has the night already started? The gate on offering a review form. */
export function eventHasHappened(startIso: string | null | undefined): boolean {
  if (!startIso) return false;
  const start = new Date(startIso).getTime();
  return Number.isFinite(start) && start < Date.now();
}

/** Mean rating to one decimal, or null when nobody has reviewed yet. */
export function averageRating(reviews: EventReview[]): number | null {
  if (reviews.length === 0) return null;
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}
