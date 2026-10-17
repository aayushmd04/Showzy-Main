import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import type { Role } from "@/data/fixtures";

const CONSOLE_LABEL: Record<Role, string> = {
  out: "signed out",
  listener: "an audience account",
  artist: "an artist account",
  host: "a host account",
  admin: "an admin account",
};

/**
 * Console routes are scoped to the role on the signed-in account.
 *
 * This used to offer a one-click "view as" button that flipped the local role,
 * which meant any signed-in person could walk into the host or admin console.
 * Role now comes from the server and the only honest answers here are: sign in,
 * or ask for the right kind of account.
 */
export function RequireRole({
  roles,
  suggest,
  children,
}: {
  roles: Role[];
  suggest: Role;
  children: ReactNode;
}) {
  const { role, currentUser } = useStore();
  const { open: openAuth } = useAuthSheet();

  if (roles.includes(role)) return <>{children}</>;

  const signedOut = role === "out" || !currentUser;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center bg-ink px-4 text-center">
      <p className="t-micro">{signedOut ? "Sign in required" : "No access"}</p>
      <h1 className="t-h1 mt-3">
        {suggest === "host"
          ? "This is the host console"
          : suggest === "artist"
            ? "This is the artist console"
            : "This is the admin console"}
      </h1>

      <p className="t-body mt-3 text-muted">
        {signedOut ? (
          <>Sign in with {CONSOLE_LABEL[suggest]} to open it.</>
        ) : (
          <>
            You're signed in with {CONSOLE_LABEL[role]}, which doesn't have access
            here. If that's wrong, write to us and we'll sort out the account.
          </>
        )}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {signedOut && (
          <Button variant="primary" onClick={() => openAuth("Sign in to Showzy")}>
            Sign in
          </Button>
        )}
        <Link to="/" className="btn btn-secondary">
          Back to what's on
        </Link>
        {!signedOut && (
          <Link to="/contact" className="btn btn-secondary">
            Contact us
          </Link>
        )}
      </div>
    </div>
  );
}
