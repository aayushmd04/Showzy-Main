import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Shared plumbing for the host console.
 *
 * Two rules drive everything here:
 *   1. Never claim a save that the server hasn't confirmed.
 *   2. Never show a venue owner a raw exception.
 */

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Turn anything thrown by the API client into a sentence that says what went
 * wrong and what to do next. `fallback` should be phrased for the specific
 * action, e.g. "Couldn't save the floor plan."
 */
export function friendlyError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 401)
      return "Your session has expired. Sign in again and your changes will still be here.";
    if (err.status === 403)
      return "You don't have permission to change this. Only the venue owner can.";
    if (err.status === 404)
      return "This is no longer on the server. Reload the page to see the current version.";
    if (err.status === 409) return err.detail || fallback;
    if (err.status === 413)
      return "That file is too large. Try an image under about 5 MB.";
    if (err.status === 429)
      return "Too many requests in a row. Wait a few seconds, then try again.";
    if (err.status >= 500)
      return "Naada's server had a problem, so nothing was saved. Try again in a moment.";
    if (err.status === 400 && err.detail) return err.detail;
    return fallback;
  }
  // fetch() rejects with a TypeError when the network is unreachable.
  if (err instanceof TypeError)
    return "Can't reach Naada — check the wifi. Your changes are still on this screen.";
  return fallback;
}

/** True when the failure was the network rather than the server saying no. */
export function isOffline(err: unknown): boolean {
  return err instanceof TypeError || !navigator.onLine;
}

// ─── Debounced, honest autosave ───────────────────────────────────────────────

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface DebouncedSave<T> {
  status: SaveStatus;
  /** Set only once the server has confirmed a write. */
  savedAt: Date | null;
  error: string | null;
  /** Queue `value` and save it after the debounce window. */
  schedule: (value: T) => void;
  /** Save whatever is queued right now. */
  flush: () => void;
  /** Re-run a save that failed. */
  retry: () => void;
  hasUnsaved: boolean;
}

/**
 * Debounces writes to the API and reports the *server's* answer.
 *
 * The queued value survives a failure, so a host who loses wifi mid-edit keeps
 * their work and can retry rather than discovering later that the "Saved"
 * stamp was decorative.
 */
export function useDebouncedSave<T>(
  save: (value: T) => Promise<unknown>,
  options: { delay?: number; errorFallback?: string } = {},
): DebouncedSave<T> {
  const { delay = 900, errorFallback = "Couldn't save that change." } = options;

  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const pendingRef = useRef<{ value: T } | null>(null);
  const inflightRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inflightRef.current) return;
    const job = pendingRef.current;
    if (!job) return;

    pendingRef.current = null;
    inflightRef.current = true;
    setStatus("saving");

    try {
      await saveRef.current(job.value);
      setError(null);
      setSavedAt(new Date());
      // A change made while the request was in flight is still unsaved.
      setStatus(pendingRef.current ? "pending" : "saved");
    } catch (err) {
      // Put the work back so nothing is silently dropped.
      if (!pendingRef.current) pendingRef.current = job;
      setError(friendlyError(err, errorFallback));
      setStatus("error");
      inflightRef.current = false;
      return;
    }
    inflightRef.current = false;
    if (pendingRef.current) {
      timerRef.current = window.setTimeout(() => flushRef.current(), delay);
    }
  }, [delay, errorFallback]);

  useEffect(() => {
    flushRef.current = () => void flush();
  }, [flush]);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      setStatus("pending");
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => flushRef.current(), delay);
    },
    [delay],
  );

  const retry = useCallback(() => void flush(), [flush]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const hasUnsaved = status === "pending" || status === "saving" || status === "error";

  // A host who closes the tab mid-save should be told, not surprised later.
  useEffect(() => {
    if (!hasUnsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsaved]);

  return { status, savedAt, error, schedule, flush: () => void flush(), retry, hasUnsaved };
}

// ─── Save status readout ──────────────────────────────────────────────────────

function clockTime(d: Date): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/**
 * The one place the console is allowed to say "Saved". It reads `savedAt`,
 * which is written only after a 2xx.
 */
export function SaveStatusLine({
  state,
  className,
}: {
  state: Pick<DebouncedSave<unknown>, "status" | "savedAt" | "error">;
  className?: string;
}) {
  const { status, savedAt, error } = state;

  let text: string;
  let tone = "text-muted";
  if (status === "error") {
    text = "Not saved";
    tone = "text-fault";
  } else if (status === "saving") {
    text = "Saving…";
  } else if (status === "pending") {
    text = "Unsaved changes";
    tone = "text-gold";
  } else if (savedAt) {
    text = `Saved ${clockTime(savedAt)}`;
    tone = "text-live";
  } else {
    text = "No changes yet";
  }

  return (
    <span
      className={cn("t-mono text-[12px]", tone, className)}
      aria-live="polite"
      title={error ?? undefined}
    >
      {text}
    </span>
  );
}

/**
 * Non-blocking failure banner. It never covers the form, and it always offers
 * the way out (retry) rather than just naming the problem.
 */
export function ErrorNote({
  message,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-start gap-3 border border-fault bg-fault/10 px-4 py-3",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-fault" aria-hidden="true" />
      <p className="t-small min-w-0 flex-1 text-paper">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="t-mono shrink-0 text-[12px] uppercase tracking-[0.08em] text-fault underline underline-offset-4"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}

/** Consistent skeleton for the "still fetching" moment on every host screen. */
export function LoadingNote({ label }: { label: string }) {
  return (
    <p className="t-small mt-6 text-muted" role="status">
      {label}
    </p>
  );
}

// ─── Datetime helpers ─────────────────────────────────────────────────────────

/** ISO 8601 (UTC, from the server) → the value an <input type="datetime-local"> wants. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** The datetime-local value (venue-local wall clock) → ISO 8601 for the API. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/** `Thu 28 Aug 2026 · 20:00` — for read-only summaries. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  })} · ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
