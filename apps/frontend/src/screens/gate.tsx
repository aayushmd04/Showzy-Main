import { useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { Check, ScanLine, X } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { Button } from "@/components/ui/button";
import { useStore } from "@/store/app-store";
import { acceptGateInvite, declineGateInvite, swrFetcher, type MyGate } from "@/lib/api";
import { usePageMeta } from "@/lib/use-meta";

/**
 * Gate duty — where an invited gatekeeper accepts (or declines) an invitation
 * and starts checking tickets. Any signed-in account can open this page; what
 * it shows comes entirely from invitations naming that account's own email or
 * phone number. Accepting gives access to one event's door and nothing else.
 */

function when(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export function GateScreen() {
  usePageMeta({ title: "Gate duty", description: "Check tickets at events you've been invited to." });
  const { role, currentUser, toast } = useStore();
  const { open: openAuth } = useAuthSheet();
  const signedIn = role !== "out" && !!currentUser;
  const { data, mutate, isLoading } = useSWR<MyGate>(
    signedIn ? "/gate/mine/" : null,
    (path: string) => swrFetcher(path),
    { refreshInterval: 15000 },
  );
  const [busy, setBusy] = useState<string | null>(null);

  const respond = async (id: string, accept: boolean) => {
    setBusy(id);
    try {
      await (accept ? acceptGateInvite(id) : declineGateInvite(id));
      toast(accept ? "You're on the gate team." : "Invitation declined.", "success");
      await mutate();
    } catch {
      toast("That didn't go through. Try again.", "fault");
    } finally {
      setBusy(null);
    }
  };

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:px-8 md:py-10">
        <h1 className="t-display">Gate duty</h1>
        <p className="t-body mt-2 text-muted">
          Invited to check tickets at someone's event? Accept here. You'll be able to scan tickets for that
          event only, around its start time.
        </p>

        {!signedIn ? (
          <div className="mt-8 border border-line bg-surface p-5">
            <p className="t-body">Sign in with the email or phone number you were invited on.</p>
            <Button className="mt-4" variant="primary" onClick={() => openAuth("Sign in to Showzy")}>
              Sign in
            </Button>
          </div>
        ) : (
          <>
            <section className="mt-8">
              <h2 className="t-micro">Invitations</h2>
              {isLoading && <p className="t-small mt-3 text-muted" role="status">Loading…</p>}
              {data && data.invitations.length === 0 && (
                <p className="t-small mt-3 text-muted">
                  No pending invitations for {currentUser?.email}. If you were invited by phone number, make sure
                  it's saved in Settings.
                </p>
              )}
              <ul className="mt-3 flex flex-col gap-3">
                {data?.invitations.map((i) => (
                  <li key={i.id} className="border border-line bg-surface p-4">
                    <p className="text-[16px] font-semibold">{i.event.title}</p>
                    <p className="t-small mt-0.5 text-muted">
                      {when(i.event.starts_at)} · {i.event.venue}
                    </p>
                    <p className="t-small mt-2 text-paper/80">
                      {i.invited_by || "The organiser"} invited you to check tickets
                      {i.label ? ` at ${i.label}` : ""}.
                    </p>
                    <ul className="t-micro mt-2 list-disc pl-4 text-muted">
                      <li>You can scan tickets and search the guest list for this event only.</li>
                      <li>You won't see buyer contact details, sales or anything else.</li>
                      <li>Access works from 4 hours before the event until 4 hours after it ends.</li>
                    </ul>
                    <div className="mt-3 flex gap-2">
                      <Button variant="primary" disabled={busy === i.id} onClick={() => void respond(i.id, true)}>
                        <Check className="size-4" aria-hidden="true" />
                        Accept
                      </Button>
                      <Button disabled={busy === i.id} onClick={() => void respond(i.id, false)}>
                        <X className="size-4" aria-hidden="true" />
                        Decline
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-8">
              <h2 className="t-micro">Your doors</h2>
              {data && data.assignments.length === 0 && (
                <p className="t-small mt-3 text-muted">Nothing yet. Accepted invitations show up here.</p>
              )}
              <ul className="mt-3 flex flex-col gap-3">
                {data?.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 border border-line bg-surface p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] font-semibold">{a.event.title}</p>
                      <p className="t-small text-muted">
                        {when(a.event.starts_at)} · {a.event.venue}
                        {a.label ? ` · ${a.label}` : ""}
                      </p>
                      <p className="t-small mt-1 text-muted">
                        {a.open_now
                          ? `Gate is open · you've checked in ${a.scanned}`
                          : `Opens ${when(a.opens)}`}
                      </p>
                    </div>
                    {a.open_now ? (
                      <Link to={`/gate/${a.event.id}/door`} className="btn btn-primary">
                        <ScanLine className="size-4" aria-hidden="true" />
                        Start checking tickets
                      </Link>
                    ) : (
                      <Button disabled>Not open yet</Button>
                    )}
                    <Button size="sm" onClick={() => void respond(a.id, false)} disabled={busy === a.id}>
                      Leave
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </PublicShell>
  );
}
