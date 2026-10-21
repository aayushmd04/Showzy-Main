import { Link } from "react-router-dom";

/**
 * "Your profile is missing…" — shown to an artist whose profile a host would
 * find thin. Says what to add and links straight to the place to add it.
 */
export function ProfileNudge({
  gaps,
  hasOffer = false,
  className = "",
}: {
  gaps: string[];
  /** An offer is already waiting, so finishing the profile is urgent, not a nicety. */
  hasOffer?: boolean;
  className?: string;
}) {
  if (gaps.length === 0) return null;
  const list = gaps.length > 1 ? `${gaps.slice(0, -1).join(", ")} and ${gaps[gaps.length - 1]}` : gaps[0];
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 border border-brass bg-surface px-4 py-3 ${className}`}
    >
      <p className="t-small min-w-0 flex-1 basis-[260px]">
        <span className="font-semibold">
          {hasOffer ? "Complete your profile to respond to your offer." : "Your profile isn't finished."}
        </span>{" "}
        <span className="text-muted">
          It's missing {list}. Hosts book on what they see there
          {hasOffer ? ", and a complete profile lets you counter with confidence" : ""}.
        </span>
      </p>
      <Link to="/artist/profile" className="btn btn-secondary btn-sm shrink-0">
        Complete profile
      </Link>
    </div>
  );
}
