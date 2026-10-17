import { Star, BadgeCheck } from "lucide-react";
import { dateCompact, pluralise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { averageRating, type EventReview } from "./event-data";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          aria-hidden="true"
          className={cn("size-3.5", n <= rating ? "fill-current text-gold" : "text-line")}
        />
      ))}
    </span>
  );
}

/** What people who were there said. Empty is a state, not a blank space. */
export function EventReviews({
  reviews,
  className,
}: {
  reviews: EventReview[];
  className?: string;
}) {
  const average = averageRating(reviews);

  return (
    <div className={className}>
      {average !== null && (
        <p className="t-small mt-3 flex flex-wrap items-center gap-2 text-muted">
          <Stars rating={Math.round(average)} />
          <span className="t-mono text-paper">{average.toFixed(1)}</span>
          <span>from {pluralise(reviews.length, "review")}</span>
        </p>
      )}

      {reviews.length === 0 ? (
        <p className="t-small mt-3 text-muted">
          No reviews yet. Whoever goes first sets the tone.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line border-y border-line">
          {reviews.map((review) => (
            <li key={review.id} className="py-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars rating={review.rating} />
                <span className="text-[15px]">
                  {review.reviewer_name || "A Showzy listener"}
                </span>
                {review.is_verified_attendee && (
                  <span className="t-small flex items-center gap-1 text-live">
                    <BadgeCheck className="size-3.5" aria-hidden="true" />
                    Verified attendee
                  </span>
                )}
                <span className="t-mono ml-auto shrink-0 text-[12px] text-muted">
                  {dateCompact(review.created_at.slice(0, 10))}
                </span>
              </div>
              {review.comment && (
                <p className="t-body mt-2 max-w-[62ch] whitespace-pre-line text-paper/90">
                  {review.comment}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
