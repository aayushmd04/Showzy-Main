import { Link } from "react-router-dom";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { StatTile } from "@/components/naada/stat-tile";
import { useStore } from "@/store/app-store";

/**
 * Admin / Ops console home — mind map §14. Verification, disputes and
 * flagged messages are the first-class deliverables here, not a ledger
 * with a "view more" link nobody opens.
 */
export function AdminHomeScreen() {
  const { artists, bookings, messages, settlements } = useStore();

  const pendingKyc = artists.filter((a) => a.kycStatus === "pending").length;
  const openDisputes = bookings.filter((b) => b.state === "disputed").length;
  const flagged = messages.filter((m) => m.flagged).length;
  const held = settlements.filter((s) => s.status === "held").length;

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Overview"]}>
      <h1 className="t-h1">Overview</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Verification, disputes and flagged messages are where the operations time actually
        goes — the process matters more than the code.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile value={String(pendingKyc)} label="Artists awaiting KYC" tone="brass" />
        <StatTile value={String(openDisputes)} label="Open disputes" tone="signal" />
        <StatTile value={String(flagged)} label="Flagged messages" tone="signal" />
        <StatTile value={String(held)} label="Settlements held" />
      </div>

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
