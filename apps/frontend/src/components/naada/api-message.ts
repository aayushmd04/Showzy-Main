import { ApiError } from "@/lib/api";

/**
 * Turn a failed call into a sentence that names what broke and what to do next.
 *
 * `action` completes the phrase "couldn't <action>" — lower case, no full stop,
 * e.g. `"save that gig"`, `"post your review"`.
 */
export function actionError(err: unknown, action: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return `Your session ended before we could ${action}. Sign in again and try once more.`;
    }
    if (err.status === 404) {
      return `That's no longer on Showzy, so we couldn't ${action}.`;
    }
    if (err.status === 429) {
      return "That was a lot of taps at once. Wait a few seconds, then try again.";
    }
    if (err.status >= 500) {
      return `Showzy's server couldn't ${action}. Wait a moment and try again.`;
    }
    // A 400 from DRF already carries the field message worth showing.
    return err.detail;
  }
  // fetch() rejects with a TypeError when the network never answered.
  if (err instanceof TypeError) {
    return `Couldn't reach Showzy to ${action}. Check your connection and try again.`;
  }
  return `Something went wrong and we couldn't ${action}. Try again.`;
}
