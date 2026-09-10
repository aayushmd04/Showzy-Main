import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getSavedEvents, saveEvent } from "@/lib/api";
import type { ApiEvent } from "@/lib/api";
import { useStore } from "@/store/app-store";
import { actionError } from "./api-message";

/**
 * One shared copy of "which events has this person saved".
 *
 * A heart on a card has to know its own state, and a grid of twenty cards must
 * not become twenty requests. So the answer lives in one module-level store
 * that every consumer subscribes to, fetched once per signed-in user from
 * `GET /events/saved/` — the server, not component state, which is what makes
 * it survive a reload.
 */

export type SavedStatus = "idle" | "loading" | "ready" | "error";

interface SavedState {
  /** Ids of every saved event — what a heart reads. */
  ids: ReadonlySet<string>;
  /** Full rows, for the /saved screen. Only the fetch writes these. */
  events: ApiEvent[];
  status: SavedStatus;
  error: string;
}

let state: SavedState = { ids: new Set(), events: [], status: "idle", error: "" };
/** The user id the data above belongs to, so a sign-out can't leak a list. */
let loadedFor: string | null = null;
let inFlight: Promise<void> | null = null;

const listeners = new Set<() => void>();

function set(patch: Partial<SavedState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state;

function load(): Promise<void> {
  if (inFlight) return inFlight;
  set({ status: "loading", error: "" });
  inFlight = (async () => {
    try {
      // This endpoint is the one list on the API that isn't paginated — it
      // returns a bare array, not {results: [...]}.
      const rows = await getSavedEvents();
      const list = Array.isArray(rows) ? rows : [];
      set({
        events: list,
        ids: new Set(list.map((event) => event.id)),
        status: "ready",
        error: "",
      });
    } catch (err) {
      set({ status: "error", error: actionError(err, "load your saved gigs") });
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

function ensureLoaded(userId: string | null) {
  if (!userId) {
    if (loadedFor !== null || state.status !== "idle") {
      loadedFor = null;
      set({ ids: new Set(), events: [], status: "idle", error: "" });
    }
    return;
  }
  // An error is not retried on its own — that would loop. `reload()` exists.
  if (loadedFor === userId && state.status !== "idle") return;
  loadedFor = userId;
  void load();
}

/**
 * Flip the save on one event, showing the new state immediately and putting it
 * back if the server refuses. Resolves to the state the server confirmed;
 * rejects (after reverting) when the call failed.
 */
export async function toggleSavedEvent(id: string): Promise<boolean> {
  const next = !state.ids.has(id);

  const optimistic = new Set(state.ids);
  if (next) optimistic.add(id);
  else optimistic.delete(id);
  set({ ids: optimistic });

  try {
    const res = await saveEvent(id, next);
    const confirmed = new Set(state.ids);
    if (res.saved) confirmed.add(id);
    else confirmed.delete(id);
    set({ ids: confirmed });
    return res.saved;
  } catch (err) {
    // Revert only this id, so a second heart tapped meanwhile keeps its state.
    const reverted = new Set(state.ids);
    if (next) reverted.delete(id);
    else reverted.add(id);
    set({ ids: reverted });
    throw err;
  }
}

export interface SavedEvents extends SavedState {
  signedIn: boolean;
  reload: () => void;
  toggle: (id: string) => Promise<boolean>;
}

export function useSavedEvents(): SavedEvents {
  const { currentUser } = useStore();
  const userId = currentUser?.id ?? null;
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot);

  useEffect(() => {
    ensureLoaded(userId);
  }, [userId]);

  const reload = useCallback(() => {
    if (!userId) return;
    loadedFor = userId;
    void load();
  }, [userId]);

  return { ...snap, signedIn: Boolean(userId), reload, toggle: toggleSavedEvent };
}
