import { Button } from "@/components/ui/button";

/** Section 11: empty states are invitations with a button, not shrugs. */
export function EmptyState({
  headline,
  body,
  actionLabel,
  onAction,
}: {
  headline: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="glass-soft flex flex-col items-center rounded-xl border-dashed px-6 py-16 text-center">
      <h3 className="t-h2 max-w-[26ch]">{headline}</h3>
      <p className="t-body mt-2 max-w-[42ch] text-muted">{body}</p>
      <Button variant="primary" className="mt-6" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
