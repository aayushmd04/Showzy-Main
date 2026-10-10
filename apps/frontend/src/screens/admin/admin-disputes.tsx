import { useEffect, useState } from "react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { get, post } from "@/lib/api";
import { dateCompact } from "@/lib/format";

interface ApiDispute {
  id: string;
  booking_order: string;
  /** The raiser's user id — a bare UUID, not a nested object. This screen
   * used to declare it as `{ id, full_name, email }` and read
   * `raised_by.full_name` off it, which is `undefined` on a string: every
   * dispute in the console rendered "Raised by" followed by nothing. The name
   * and address come flat, alongside.
   *
   * All three are nullable: the foreign key is SET_NULL, so a dispute raised
   * by an account that has since been erased keeps the row and loses the
   * person. */
  raised_by: string | null;
  raised_by_name: string | null;
  raised_by_email: string | null;
  reason: string;
  resolution: "pending" | "release" | "refund" | "split";
  admin_notes: string;
  created_at: string;
  resolved_at?: string;
}

/** Whoever raised it, however much of them the server could tell us. A user
 * who has since exercised their right to erasure keeps the row but loses the
 * name, and "Raised by" followed by a blank is worse than saying so. */
function raisedBy(d: ApiDispute): string {
  return d.raised_by_name?.trim() || d.raised_by_email?.trim() || "a deleted account";
}

export function AdminDisputesScreen() {
  const [disputes, setDisputes] = useState<ApiDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDispute, setOpenDispute] = useState<ApiDispute | null>(null);
  const [note, setNote] = useState("");
  const [resolving, setResolving] = useState(false);

  const fetchDisputes = () => {
    setLoading(true);
    get<{ results?: ApiDispute[] }>("/admin/disputes/")
      .then((r) => setDisputes(Array.isArray(r) ? r : (r.results ?? [])))
      .catch(() => setDisputes([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchDisputes(); }, []);

  const resolve = async (resolution: "release" | "refund") => {
    if (!openDispute) return;
    setResolving(true);
    try {
      await post(`/admin/disputes/${openDispute.id}/resolve/`, {
        resolution,
        admin_notes: note.trim() || "Resolved by admin.",
      });
      fetchDisputes();
      setOpenDispute(null);
      setNote("");
    } catch {
      // keep modal open, let admin retry
    } finally {
      setResolving(false);
    }
  };

  const open = disputes.filter((d) => d.resolution === "pending");
  const resolved = disputes.filter((d) => d.resolution !== "pending");

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Disputes"]}>
      <h1 className="t-h1">Disputes</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Funds stay in escrow until a dispute is resolved here — the auto-release timer never
        fires on a disputed booking.
      </p>

      <h2 className="t-section mt-8">Open</h2>
      {loading && <p className="t-small mt-3 text-muted">Loading…</p>}
      {!loading && open.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {open.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-[15px]">
                  Raised by <strong>{raisedBy(d)}</strong> — {dateCompact(d.created_at)}
                </p>
                <p className="t-small mt-2 max-w-[56ch] border-l-2 border-line pl-3 text-muted">
                  {d.reason}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <Pill>Disputed</Pill>
                <Button size="sm" variant="primary" onClick={() => { setOpenDispute(d); setNote(""); }}>
                  Resolve
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : !loading && (
        <p className="t-small mt-3 border border-dashed border-line px-4 py-8 text-center text-muted">
          No open disputes.
        </p>
      )}

      {resolved.length > 0 && (
        <>
          <h2 className="t-section mt-10">Resolved</h2>
          <ul className="mt-3 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
            {resolved.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <p className="text-[14px]">{raisedBy(d)}</p>
                  <p className="t-small mt-0.5 truncate text-muted">{d.admin_notes}</p>
                </div>
                <Pill tone={d.resolution === "release" ? "live" : "fault"}>
                  {d.resolution === "release" ? "Released" : "Refunded"}
                </Pill>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={Boolean(openDispute)}
        onClose={() => { setOpenDispute(null); setNote(""); }}
        title="Resolve dispute"
      >
        {openDispute && (
          <>
            <p className="t-body text-paper/90">
              Raised by <strong>{raisedBy(openDispute)}</strong>
            </p>
            <p className="t-small mt-3 border-l-2 border-line pl-3 text-muted">
              {openDispute.reason}
            </p>
            <label htmlFor="resolution-note" className="t-micro mb-2 mt-5 block">
              Resolution note
            </label>
            <Textarea
              id="resolution-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What did you decide, and why?"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" disabled={resolving} onClick={() => resolve("release")}>
                Release to artist
              </Button>
              <Button variant="destructive" disabled={resolving} onClick={() => resolve("refund")}>
                Refund host
              </Button>
            </div>
          </>
        )}
      </Modal>
    </ConsoleShell>
  );
}
