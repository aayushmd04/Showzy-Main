import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { EventCard } from "@/components/naada/event-card";
import { SaveButton } from "@/components/naada/save-button";
import { useSavedEvents } from "@/components/naada/saved-events";
import { EmptyState } from "@/components/naada/empty-state";
import { Button } from "@/components/ui/button";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { adaptEvent } from "@/lib/adapters";
import { usePageMeta } from "@/lib/use-meta";

/**
 * Everything this listener bookmarked, read back from `GET /events/saved/`.
 *
 * Rows stay on screen after they're un-saved, with the bookmark gone hollow —
 * that is the undo for a mis-tap. They're gone the next time the page loads.
 */
export function SavedScreen() {
  usePageMeta({
    title: "Saved gigs",
    description: "The nights you bookmarked on Naada.",
  });

  const navigate = useNavigate();
  const { open: openAuth } = useAuthSheet();
  const { events, ids, status, error, signedIn, reload } = useSavedEvents();

  /*
   * The shared store updates saved *ids* the instant a heart is tapped, but
   * only a fetch writes the full rows. Without this, saving a gig and then
   * opening this screen showed everything except the gig just saved. Opening
   * your own list is exactly when you want it current.
   */
  useEffect(() => {
    reload();
  }, [reload]);

  const rows = useMemo(
    () => events.map((raw) => ({ raw, event: adaptEvent(raw) })),
    [events],
  );
  const stillSaved = rows.filter(({ raw }) => ids.has(raw.id)).length;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-8 md:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="t-display">Saved</h1>
          {status === "ready" && rows.length > 0 && (
            <p className="t-small text-muted">
              <span className="t-mono">{stillSaved}</span>{" "}
              {stillSaved === 1 ? "gig" : "gigs"} on your list
            </p>
          )}
        </div>

        {!signedIn && (
          <div className="mt-8 border border-line bg-surface p-6 text-center">
            <p className="t-h3">Your saved gigs live with your account.</p>
            <p className="t-body mt-2 text-muted">
              Sign in and everything you bookmark shows up here, on any device.
            </p>
            <Button
              variant="primary"
              className="mt-5"
              onClick={() => openAuth("Sign in to see your saved gigs")}
            >
              Sign in
            </Button>
          </div>
        )}

        {signedIn && status === "loading" && (
          <p className="t-body mt-8 text-muted" role="status">
            Loading your saved gigs…
          </p>
        )}

        {signedIn && status === "error" && (
          <div className="mt-8 border border-fault bg-surface p-6 text-center">
            <p className="t-body">{error}</p>
            <Button variant="primary" className="mt-4" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {signedIn && status === "ready" && rows.length === 0 && (
          <div className="mt-8">
            <EmptyState
              headline="Nothing saved yet"
              body="Tap the bookmark on any gig and it waits for you here until you decide."
              actionLabel="See what's on"
              onAction={() => navigate("/")}
            />
          </div>
        )}

        {signedIn && status === "ready" && rows.length > 0 && (
          <ul className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {rows.map(({ raw, event }, index) => (
              <li key={raw.id} className="relative">
                <EventCard event={event} index={index} />
                <SaveButton
                  eventId={raw.id}
                  eventName={event.name}
                  className="absolute right-2 top-2 z-10"
                />
                {!ids.has(raw.id) && (
                  <p className="t-small mt-1 text-muted">
                    Removed — tap the bookmark to put it back.
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

      </div>
    </PublicShell>
  );
}
