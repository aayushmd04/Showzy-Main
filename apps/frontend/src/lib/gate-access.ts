import useSWR from "swr";
import { swrFetcher, type MyGate } from "@/lib/api";
import { useStore } from "@/store/app-store";

/**
 * Whether this account has anything to do at a gate.
 *
 * Gate duty is not for everyone: it exists only for a person a host has
 * invited, or who has accepted. For everyone else the link, the page and the
 * scanner must not appear at all — so the answer comes from the one thing that
 * knows, the list of invitations and doors the server holds for this account,
 * not from a role or a flag that could go stale. An invite sent while someone
 * is signed in shows up within a minute, or the moment they return to the tab.
 */
export function useGateAccess(): {
  /** Still asking. Render nothing yet rather than flash a link that may vanish. */
  loading: boolean;
  signedIn: boolean;
  /** Pending invitations or doors this account can work. */
  hasGateWork: boolean;
  data: MyGate | undefined;
} {
  const { role, currentUser } = useStore();
  const signedIn = role !== "out" && !!currentUser;
  const { data, error, isLoading } = useSWR<MyGate>(
    signedIn ? "/gate/mine/" : null,
    (path: string) => swrFetcher(path),
    { refreshInterval: 60_000, shouldRetryOnError: false },
  );
  return {
    loading: signedIn && isLoading && !data && !error,
    signedIn,
    hasGateWork: !!data && (data.invitations.length > 0 || data.assignments.length > 0),
    data,
  };
}
