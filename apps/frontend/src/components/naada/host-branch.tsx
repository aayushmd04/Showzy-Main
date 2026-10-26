/**
 * Which of the host's branches (venues) the console is showing.
 *
 * A host can own several: one account, several venue rows. The choice lives here, in one
 * place, so every console page follows it. It is remembered in the browser, and when the
 * host has only one venue there is nothing to choose and nothing is filtered.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { getMyVenues, type ApiVenue } from "@/lib/api";
import { useStore } from "@/store/app-store";

const KEY = "showzy_host_branch";

interface Branches {
  venues: ApiVenue[];
  /** The branch being shown, or null while loading or when the host has none. */
  current: ApiVenue | null;
  /** True when the host has more than one branch, so the pages should narrow to `current`. */
  multiple: boolean;
  loading: boolean;
  select: (id: string) => void;
  /** Whether something at this venue belongs on screen. Everything does for a single-branch host. */
  includes: (venueId: string | undefined | null) => boolean;
}

const NONE: Branches = {
  venues: [],
  current: null,
  multiple: false,
  loading: false,
  select: () => {},
  includes: () => true,
};

const Ctx = createContext<Branches>(NONE);

export function useHostBranch(): Branches {
  return useContext(Ctx);
}

function remembered(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function HostBranchProvider({ children }: { children: ReactNode }) {
  const { role, currentUser } = useStore();
  const isHost = role === "host" && currentUser !== null;
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState<string | null>(remembered);

  useEffect(() => {
    if (!isHost) {
      setVenues([]);
      return;
    }
    let alive = true;
    setLoading(true);
    getMyVenues()
      .then((list) => alive && setVenues(list))
      .catch(() => alive && setVenues([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [isHost, currentUser?.id]);

  const select = useCallback((id: string) => {
    setChosen(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {
      /* the choice just won't be remembered */
    }
  }, []);

  const value = useMemo<Branches>(() => {
    const current = venues.find((v) => v.id === chosen) ?? venues[0] ?? null;
    const multiple = venues.length > 1;
    return {
      venues,
      current,
      multiple,
      loading,
      select,
      includes: (venueId) => !multiple || !current || !venueId || venueId === current.id,
    };
  }, [venues, chosen, loading, select]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The branch picker in the console header. A single branch is shown as a name; none, nothing. */
export function BranchSwitcher() {
  const { venues, current, multiple, select } = useHostBranch();
  if (!current) return null;

  const place = (v: ApiVenue) => [v.name, v.area ?? v.area_name].filter(Boolean).join(" · ");

  if (!multiple) {
    return (
      <span className="hidden max-w-[40vw] truncate text-[13px] text-muted md:inline" title={place(current)}>
        {place(current)}
      </span>
    );
  }

  return (
    <label className="relative flex min-w-0 max-w-[48vw] items-center md:max-w-[320px]">
      <span className="sr-only">Branch</span>
      <select
        value={current.id}
        onChange={(e) => select(e.target.value)}
        className="min-h-11 w-full min-w-0 truncate rounded-md border border-line bg-surface px-3 text-[14px] text-paper focus-visible:outline-2 focus-visible:outline-signal"
      >
        {venues.map((v) => (
          <option key={v.id} value={v.id}>
            {place(v)}
          </option>
        ))}
      </select>
    </label>
  );
}
