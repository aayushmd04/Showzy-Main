import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import { NotFoundScreen } from "@/screens/not-found";
import { useGateAccess } from "@/lib/gate-access";
import { useStore } from "@/store/app-store";
import { RestoringSession } from "./require-role";

/**
 * Guards the gate-duty pages. Anyone without an invitation or a door gets the
 * ordinary "page not found" — the same answer as for a URL that was never a
 * page — so nothing tells them there is a gate feature at all.
 *
 * `door` additionally requires the account to be assigned to *that* event.
 * Signed-out visitors are let through to `/gate` only, whose page offers
 * sign-in: a person invited before they had an account arrives by link.
 */
export function RequireGate({
  children,
  door = false,
}: {
  children: ReactNode;
  door?: boolean;
}) {
  const { id } = useParams();
  const { authReady } = useStore();
  const { loading, signedIn, hasGateWork, data } = useGateAccess();

  // A reload at the door: wait for the saved session rather than answering
  // "signed out" (a 404 for the scanner) while it is still being restored.
  if (!authReady && !signedIn) return <RestoringSession />;
  if (!signedIn) return door ? <NotFoundScreen /> : <>{children}</>;
  if (loading) {
    return (
      <p className="t-small p-6 text-muted" role="status">
        Loading…
      </p>
    );
  }
  if (!hasGateWork) return <NotFoundScreen />;
  if (door && !data?.assignments.some((a) => a.event.id === id)) return <NotFoundScreen />;
  return <>{children}</>;
}
