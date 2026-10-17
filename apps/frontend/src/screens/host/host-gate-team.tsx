import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import useSWR from "swr";
import { ArrowLeft, Mail, Phone, ScanLine, UserPlus, X } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import {
  inviteGatekeeper,
  revokeGatekeeper,
  swrFetcher,
  type GateOverview,
  type GateStatus,
} from "@/lib/api";
import { ErrorNote, LoadingNote, formatDateTime, friendlyError } from "./host-shared";

/**
 * Gate team — the host's view of everyone allowed to check tickets at one
 * event, and a live feed of every scan. Gatekeepers are invited by email or
 * phone, accept with their own account, and can do nothing but scan this one
 * event inside a time window; the host can end that access in one tap.
 */

const STATUS: Record<GateStatus, { label: string; tone: PillTone }> = {
  pending: { label: "Invited", tone: "brass" },
  active: { label: "Active", tone: "live" },
  declined: { label: "Declined", tone: "muted" },
  revoked: { label: "Revoked", tone: "muted" },
};

function time(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function HostGateTeamScreen() {
  const { id = "" } = useParams();
  const { toast } = useStore();
  // Polled every few seconds — scans appear without touching the page.
  const { data, error, mutate } = useSWR<GateOverview>(
    id ? `/events/${id}/gate/` : null,
    (path: string) => swrFetcher(path),
    { refreshInterval: 4000, keepPreviousData: true },
  );

  const [mode, setMode] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!contact.trim()) {
      setFormError(mode === "email" ? "Enter their email." : "Enter their phone number.");
      return;
    }
    setBusy(true);
    try {
      const res = await inviteGatekeeper(id, {
        [mode]: contact.trim(),
        label: label.trim() || undefined,
      });
      toast(
        res.has_account
          ? "Invite sent. They'll see it under Gate duty."
          : "Invite saved. It will appear for them when they sign up with that " + mode + ".",
        "success",
      );
      setContact("");
      setLabel("");
      void mutate();
    } catch (err) {
      setFormError(friendlyError(err, "Couldn't send the invite."));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (assignmentId: string, who: string) => {
    if (!confirm(`End ${who}'s access to this event's door? This takes effect immediately.`)) return;
    try {
      await revokeGatekeeper(id, assignmentId);
      toast("Access ended.", "success");
      void mutate();
    } catch (err) {
      toast(friendlyError(err, "Couldn't end that access."), "fault");
    }
  };

  const team = (data?.team ?? []).filter((m) => m.status !== "revoked");
  const past = (data?.team ?? []).filter((m) => m.status === "revoked");
  const activeCount = team.filter((m) => m.status === "active").length;

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Events", data?.event.title ?? "Event", "Gate team"]}>
      <Link to={`/host/events/${id}`} className="t-small inline-flex items-center gap-1.5 text-muted hover:text-paper">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to event
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h1">Gate team</h1>
          <p className="t-small mt-1 max-w-[60ch] text-muted">
            Invite people to check tickets at {data?.event.title ?? "this event"}. They can scan tickets
            for this event only, during the window below — they never see your venue, earnings or other
            events.
          </p>
        </div>
        <Link to={`/host/events/${id}/door`} className="btn btn-secondary">
          <ScanLine className="size-4" aria-hidden="true" />
          Open door scanner
        </Link>
      </div>

      {error && !data && <ErrorNote className="mt-6" message={friendlyError(error, "Couldn't load the gate.")} onRetry={() => void mutate()} />}
      {!data && !error && <LoadingNote label="Loading the gate…" />}

      {data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={`${data.totals.admitted}/${data.totals.tickets}`} label="Admitted" />
            <StatTile value={String(activeCount)} label="Gatekeepers active" />
            <StatTile value={String(data.totals.by_organiser)} label="Scanned by you" />
            <StatTile
              value={data.window.open_now ? "Open" : "Closed"}
              label="Gate access right now"
            />
          </div>
          <p className="t-micro mt-2 text-muted">
            Gatekeepers can scan from {formatDateTime(data.window.opens)} to {formatDateTime(data.window.closes)}.
            Outside that, their access is switched off automatically.
          </p>

          {/* ── Invite ── */}
          <section className="mt-8 border border-line bg-surface p-4">
            <h2 className="t-micro">Invite a gatekeeper</h2>
            <p className="t-small mt-1 text-muted">
              They need a Showzy account (signing up takes a minute). Use the email or phone number on it —
              they accept on their side before they can scan anything.
            </p>
            <form onSubmit={invite} className="mt-3 flex flex-col gap-3 md:flex-row md:items-end">
              <div className="md:w-[130px]">
                <Label>Invite by</Label>
                <div className="flex">
                  {(["email", "phone"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => { setMode(m); setContact(""); }}
                      aria-pressed={mode === m}
                      className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 border text-[13px] ${
                        mode === m ? "border-paper bg-surface-2 text-paper" : "border-line text-muted"
                      } ${m === "phone" ? "-ml-px" : ""}`}
                    >
                      {m === "email" ? <Mail className="size-3.5" /> : <Phone className="size-3.5" />}
                      {m === "email" ? "Email" : "Phone"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1">
                <Label htmlFor="gk-contact">{mode === "email" ? "Their email" : "Their phone number"}</Label>
                <Input
                  id="gk-contact"
                  type={mode === "email" ? "email" : "tel"}
                  inputMode={mode === "email" ? "email" : "tel"}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={mode === "email" ? "name@example.com" : "+91 98765 43210"}
                />
              </div>
              <div className="md:w-[170px]">
                <Label htmlFor="gk-label">Post (optional)</Label>
                <Input id="gk-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Main gate" />
              </div>
              <Button type="submit" variant="primary" disabled={busy}>
                <UserPlus className="size-4" aria-hidden="true" />
                {busy ? "Sending…" : "Send invite"}
              </Button>
            </form>
            <p className="t-micro mt-3 text-muted">
              Only invite people who know you're asking. Showzy uses the email or number you enter just to
              match the invitation to their account, and it is deleted if they decline or you cancel.
            </p>
            {formError && <p className="t-small mt-2 text-fault" role="alert">{formError}</p>}
          </section>

          {/* ── Team ── */}
          <section className="mt-8">
            <h2 className="t-micro">Team ({team.length}/{data.max_team})</h2>
            {team.length === 0 ? (
              <p className="t-small mt-3 text-muted">
                No one yet. You can always scan yourself from the door scanner.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-line border-y border-line">
                {team.map((m) => {
                  const st = STATUS[m.status];
                  const who = m.name || m.invitee;
                  return (
                    <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px]">
                          {who}
                          {m.label && <span className="t-small ml-2 text-muted">· {m.label}</span>}
                        </p>
                        <p className="t-small truncate text-muted">
                          {m.status === "active"
                            ? `${m.email} · joined ${formatDateTime(m.responded_at)}`
                            : `Invited ${m.invitee} · ${formatDateTime(m.invited_at)}`}
                        </p>
                      </div>
                      <Pill tone={st.tone}>{st.label}</Pill>
                      <div className="w-[120px] text-right">
                        <p className="t-mono text-[18px]">{m.scan_count}</p>
                        <p className="t-micro text-muted">scanned · last {time(m.last_scan_at)}</p>
                      </div>
                      <Button size="sm" onClick={() => void revoke(m.id, who)}>
                        <X className="size-4" aria-hidden="true" />
                        {m.status === "pending" ? "Cancel invite" : "End access"}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {past.length > 0 && (
              <p className="t-micro mt-2 text-muted">{past.length} past invite{past.length === 1 ? "" : "s"} ended.</p>
            )}
          </section>

          {/* ── Live scans ── */}
          <section className="mt-8">
            <div className="flex items-center gap-2">
              <h2 className="t-micro">Live scans</h2>
              <span className="t-micro flex items-center gap-1 text-live"><span aria-hidden="true">●</span> updating</span>
            </div>
            {data.recent.length === 0 ? (
              <p className="t-small mt-3 text-muted">No one has been checked in yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto border border-line">
                <table className="w-full text-left text-[13px]">
                  <thead className="t-micro border-b border-line text-muted">
                    <tr>
                      <th className="px-3 py-2">Time</th>
                      <th className="px-3 py-2">Ticket</th>
                      <th className="px-3 py-2">Guest</th>
                      <th className="px-3 py-2">Tier</th>
                      <th className="px-3 py-2">Scanned by</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.recent.map((s) => (
                      <tr key={`${s.ticket_number}-${s.at}`}>
                        <td className="t-mono px-3 py-2 text-muted">{time(s.at)}</td>
                        <td className="t-mono px-3 py-2">{s.ticket_number}</td>
                        <td className="px-3 py-2">{s.holder_name || "Guest"}</td>
                        <td className="px-3 py-2 text-muted">{s.tier}{s.seat ? ` · ${s.seat}` : ""}</td>
                        <td className="px-3 py-2">{s.by_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </ConsoleShell>
  );
}
