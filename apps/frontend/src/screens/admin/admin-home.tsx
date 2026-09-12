import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { getAdminOverview, type AdminOverview } from "@/lib/api";

/**
 * Admin / Ops console home — mind map §14. Verification, disputes and
 * flagged messages are the first-class deliverables here, not a ledger
 * with a "view more" link nobody opens.
 *
 * Every count below is a platform-wide query (`GET /admin/overview/`) — an
 * admin has no bookings, settlements or messages of their own, so a screen
 * built against "my" data would always read zero or wrong for this role.
 */
export function AdminHomeScreen() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getAdminOverview()
      .then((data) => { if (alive) setOverview(data); })
      .catch(() => { if (alive) setOverview(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const pendingKyc = overview?.pending_kyc ?? 0;
  const openDisputes = overview?.open_disputes ?? 0;
  const flagged = overview?.flagged_messages ?? 0;
  const held = overview?.held_transfers ?? 0;

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Overview"]}>
      <h1 className="t-h1">Overview</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Verification, disputes and flagged messages are where the operations time actually
        goes — the process matters more than the code.
      </p>

      {loading ? (
        <p className="t-small mt-6 text-muted">Loading…</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile value={String(pendingKyc)} label="Organizers awaiting KYC" tone="brass" />
          <StatTile value={String(openDisputes)} label="Open disputes" tone="signal" />
          <StatTile value={String(flagged)} label="Flagged messages" tone="signal" />
          <StatTile value={String(held)} label="Transfers on hold" />
        </div>
      )}

      <div className="mt-10 grid gap-3 sm:grid-cols-3">
        <Link
          to="/admin/verification"
          className="border border-line bg-surface p-4 transition-colors hover:border-[#3a3a45] hover:bg-surface-2"
        >
          <p className="t-h3">Verification queue</p>
          <p className="t-small mt-1 text-muted">
            {pendingKyc > 0 ? `${pendingKyc} waiting on a decision` : "Nothing waiting"}
          </p>
        </Link>
        <Link
          to="/admin/disputes"
          className="border border-line bg-surface p-4 transition-colors hover:border-[#3a3a45] hover:bg-surface-2"
        >
          <p className="t-h3">Disputes</p>
          <p className="t-small mt-1 text-muted">
            {openDisputes > 0 ? `${openDisputes} open — release timer suspended` : "None open"}
          </p>
        </Link>
        <Link
          to="/admin/messages"
          className="border border-line bg-surface p-4 transition-colors hover:border-[#3a3a45] hover:bg-surface-2"
        >
          <p className="t-h3">Flagged messages</p>
          <p className="t-small mt-1 text-muted">
            {flagged > 0 ? `${flagged} to review` : "Nothing flagged"}
          </p>
        </Link>
      </div>
    </ConsoleShell>
  );
}
