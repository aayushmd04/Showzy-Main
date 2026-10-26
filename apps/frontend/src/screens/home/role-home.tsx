/**
 * `/` is one route with four answers.
 *
 * Signed out and listeners get the discover page unchanged — it is the front
 * door and it works. An artist and a host each get a home built around what
 * they came to do; an admin goes straight to the ops overview, which is
 * already their whole job.
 */
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { HomeFeed } from "@/screens/home-feed";
import { useStore } from "@/store/app-store";
import { tokens } from "@/lib/api";

/**
 * The role arrives from `GET /auth/me/`, a round trip after the first paint.
 * Without this an artist reloading `/` would see the signed-out discover page
 * flash past before their own home replaced it. Resolved means one of two
 * things has happened: the user landed, or the token was rejected and cleared.
 */
function useSessionResolving(): boolean {
  const { currentUser } = useStore();
  const [resolving, setResolving] = useState(() => Boolean(tokens.access));

  useEffect(() => {
    if (!resolving) return;
    if (currentUser) {
      setResolving(false);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      // Never hold the page hostage to a request that is not coming back.
      if (!tokens.access || Date.now() - startedAt > 4000) setResolving(false);
    }, 120);
    return () => window.clearInterval(timer);
  }, [currentUser, resolving]);

  return resolving;
}

function HomeFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink">
      <p
        role="status"
        className="font-mono text-[11px] uppercase tracking-[0.08em] leading-[1.4] text-muted"
      >
        Loading your home…
      </p>
    </div>
  );
}

export function RoleHomeScreen() {
  const { role, currentUser } = useStore();
  const resolving = useSessionResolving();

  if (resolving) return <HomeFallback />;

  // A role without a signed-in user is a stale local value, not an account.
  // Visitors who are not signed in land on the same feed as everyone else; what the old
  // intro page said now lives in the feed's banner.
  if (!currentUser) return <HomeFeed />;

  // An artist has one home, in the console, so the layout never changes under them.
  if (role === "artist") return <Navigate to="/artist" replace />;

  // A host has one home, in the console, so the layout never changes under them.
  if (role === "host") return <Navigate to="/host" replace />;

  if (role === "admin") return <Navigate to="/admin" replace />;

  return <HomeFeed />;
}
