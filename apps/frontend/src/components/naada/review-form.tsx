import { useState } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { createEventReview } from "@/lib/api";
import { cn } from "@/lib/utils";
import { actionError } from "./api-message";
import type { EventReview } from "./event-data";

/** Matches `EventReview.comment`'s max_length on the model. */
const MAX_COMMENT = 1000;

const RATINGS = [1, 2, 3, 4, 5] as const;

function StarRating({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Your rating" className="flex gap-1">
      {RATINGS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className={cn(
            "grid size-11 place-items-center border transition-colors",
            n <= value ? "border-gold text-gold" : "border-line text-muted hover:text-paper",
            n > 1 && "-ml-px",
            disabled && "opacity-60",
          )}
        >
          <Star className={cn("size-5", n <= value && "fill-current")} aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

/**
 * Rate a night you were at. The server decides whether that makes you a
 * verified attendee — it checks for a ticket in your name — so this form never
 * claims it on your behalf.
 */
export function ReviewForm({
  eventId,
  existing,
  onSaved,
  className,
}: {
  eventId: string;
  existing?: EventReview | null;
  onSaved?: (review: EventReview) => void;
  className?: string;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(!existing);

  const commentId = `review-comment-${eventId}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      setError("Pick a rating from one to five stars first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = (await createEventReview(eventId, {
        rating,
        comment: comment.trim(),
      })) as EventReview;
      setEditing(false);
      onSaved?.(saved);
    } catch (err) {
      setError(actionError(err, "post your review"));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className={cn("border border-line bg-surface p-4", className)}>
        <p className="t-body">
          Thanks — your review is up.{" "}
          <span className="t-mono text-gold">{rating}/5</span>
        </p>
        <Button
          size="sm"
          className="mt-3"
          onClick={() => {
            setEditing(true);
            setError("");
          }}
        >
          Edit my review
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("border border-line bg-surface p-4", className)}>
      <Label>{existing ? "Update your review" : "How was it?"}</Label>
      <StarRating value={rating} onChange={setRating} disabled={busy} />

      <div className="mt-4">
        <Label htmlFor={commentId}>A line about the night (optional)</Label>
        <Textarea
          id={commentId}
          rows={3}
          maxLength={MAX_COMMENT}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={busy}
          placeholder="Sound, crowd, the room — whatever the next person should know."
        />
        <p className="t-small mt-2 text-muted">
          <span className="t-mono">{MAX_COMMENT - comment.length}</span> characters left
        </p>
      </div>

      {error && (
        <p className="t-small mt-3 text-fault" role="alert">
          {error}
        </p>
      )}

      <Button variant="primary" type="submit" className="mt-4" disabled={busy}>
        {busy ? "Posting…" : existing ? "Update review" : "Post review"}
      </Button>
    </form>
  );
}
