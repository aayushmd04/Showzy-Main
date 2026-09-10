import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import type { Role } from "@/data/fixtures";

const ROLE_LABEL: Record<Role, string> = {
  out: "signed out",
  listener: "someone booking tickets",
  artist: "an artist",
  host: "a host",
  admin: "an admin",
};

/**
 * Console routes are role-scoped. Rather than bouncing the viewer somewhere
 * else, say what's needed and offer the one-click switch — the dev switcher
 * bottom-right does the same thing.
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
  const { role, setRole, currentUser } = useStore();
  if (roles.includes(role)) return <>{children}</>;

  const who = currentUser?.full_name
    ? `${currentUser.full_name} — ${ROLE_LABEL[role]}`
    : ROLE_LABEL[role];

  return (
    <div className="theme-light mx-auto flex min-h-dvh w-full max-w-[560px] flex-col items-center justify-center px-4 text-center" style={{ background: "#F4F1EB" }}>
      <p className="t-micro">Role required</p>
      <h1 className="t-h1 mt-3">This is the {suggest} console</h1>
      <p className="t-body mt-3 text-muted">
        You're currently {who}. Switch roles to carry on — the dev switcher in the
        bottom-right corner does the same thing at any time.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={() => setRole(suggest)}>
          View as {ROLE_LABEL[suggest]}
        </Button>
        <Link to="/" className="btn btn-secondary">
          Back to Discover
        </Link>
      </div>
    </div>
  );
}
