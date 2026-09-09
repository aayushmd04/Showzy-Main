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
  raised_by: { id: string; full_name: string; email: string };
  reason: string;
  resolution: "pending" | "release" | "refund" | "split";
  admin_notes: string;
  created_at: string;
  resolved_at?: string;
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

      <h2 className="t-micro mt-8">Open</h2>
      {loading && <p className="t-small mt-3 text-muted">Loading…</p>}
      {!loading && open.length > 0 ? (
        <ul className="mt-3 divide-y divide-line border border-line bg-surface">
          {open.map((d) => (
            <li key={d.id} className="flex flex-wrap items-start gap-4 px-4 py-4">
              <div className="min-w-0 flex-1 basis-[240px]">
                <p className="text-[15px]">
                  Raised by <strong>{d.raised_by.full_name}</strong> — {dateCompact(d.created_at)}
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
          <h2 className="t-micro mt-10">Resolved</h2>
          <ul className="mt-3 divide-y divide-line border border-line bg-surface">
            {resolved.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1 basis-[220px]">
                  <p className="text-[14px]">{d.raised_by.full_name}</p>
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
              Raised by <strong>{openDispute.raised_by.full_name}</strong>
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
