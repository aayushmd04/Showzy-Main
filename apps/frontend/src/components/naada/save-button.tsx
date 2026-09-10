import { useState } from "react";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { actionError } from "./api-message";
import { useSavedEvents } from "./saved-events";

/**
 * Save / unsave one event.
 *
 * `variant="icon"` is the corner control on a card; `variant="button"` is the
 * labelled one on the event page. Both flip instantly and put themselves back
 * if the server says no — a bookmark that waits on a round trip reads as broken.
 */
export function SaveButton({
  eventId,
  eventName,
  variant = "icon",
  size = "default",
  className,
}: {
  eventId: string;
  eventName: string;
  variant?: "icon" | "button";
  size?: "default" | "sm";
  className?: string;
}) {
  const { toast } = useStore();
  const { open: openAuth } = useAuthSheet();
  const { ids, signedIn, toggle, reload } = useSavedEvents();
  const [busy, setBusy] = useState(false);

  const saved = ids.has(eventId);

  const run = async () => {
    setBusy(true);
    try {
      const now = await toggle(eventId);
      toast(now ? `Saved — ${eventName}` : `Removed ${eventName} from saved`);
    } catch (err) {
      toast(
        actionError(err, saved ? "remove that from your saved list" : "save that gig"),
        "fault",
      );
    } finally {
      setBusy(false);
    }
  };

  const onClick = () => {
    if (busy) return;
    if (!signedIn) {
      // A 401 here would look like a dead button. Ask for the sign-in, then
      // finish the save the person actually asked for.
      openAuth("Sign in to save this gig", {
        onDone: (outcome) => {
          if (outcome !== "authed") return;
          void run().then(reload);
        },
      });
      return;
    }
    void run();
  };

  const label = saved ? `Remove ${eventName} from saved` : `Save ${eventName}`;

  if (variant === "button") {
    return (
      <Button
        onClick={onClick}
        disabled={busy}
        size={size}
        aria-pressed={saved}
        aria-label={label}
        className={className}
      >
        <Bookmark
          className={cn("size-4", saved && "fill-current text-signal")}
          aria-hidden="true"
        />
        {saved ? "Saved" : "Save"}
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className={cn(
        "grid size-10 place-items-center border border-line bg-surface/95 transition-colors",
        saved ? "text-signal" : "text-muted hover:text-paper",
        busy && "opacity-60",
        className,
      )}
    >
      <Bookmark className={cn("size-4", saved && "fill-current")} aria-hidden="true" />
    </button>
  );
}
