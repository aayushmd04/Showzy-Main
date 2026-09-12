import { useEffect, useState } from "react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill, type PillTone } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import {
  getOrganizerKycQueue, setOrganizerKyc, type AdminOrganizer,
} from "@/lib/api";

const KYC_TONE: Record<AdminOrganizer["kyc_status"], PillTone> = {
  pending: "muted",
  submitted: "brass",
  verified: "live",
  rejected: "fault",
};

const ORG_TYPE_LABEL: Record<AdminOrganizer["organizer_type"], string> = {
  venue: "Venue",
  company: "Event company",
  individual: "Individual promoter",
};

/**
 * Organizer KYC queue — Q17 in the technical discovery, corrected to the
 * entity the backend actually gates on.
 *
 * The real Razorpay Linked Account / KYC concept lives on `Organizer` (the
 * host/venue side that receives money to fund a booking), never on `Artist`
 * — artists have no KYC field at all. This screen used to operate entirely
 * on a fixture `Artist.kycStatus` that has no backend counterpart, so
 * "Approve" changed nothing real. It now reads and writes the actual gate on
 * `Organizer.can_book_artists`.
 */
export function AdminVerificationScreen() {
  const { toast } = useStore();
  const [organizers, setOrganizers] = useState<AdminOrganizer[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminOrganizer | null>(null);
  const [reason, setReason] = useState("");

  const load = () => {
    setLoading(true);
    getOrganizerKycQueue()
      .then(setOrganizers)
      .catch(() => setOrganizers([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const pendingCount = organizers.filter(
    (o) => o.kyc_status === "pending" || o.kyc_status === "submitted",
  ).length;

  const approve = async (organizer: AdminOrganizer) => {
    setActing(organizer.id);
    try {
      const updated = await setOrganizerKyc(organizer.id, "verified");
      setOrganizers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast(`${organizer.name} verified`, "success");
    } catch {
      toast("Couldn't verify that organizer", "fault");
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.id);
    try {
      const updated = await setOrganizerKyc(rejectTarget.id, "rejected", reason.trim());
      setOrganizers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      toast(`${rejectTarget.name} rejected`, "fault");
      setRejectTarget(null);
      setReason("");
    } catch {
      toast("Couldn't reject that organizer", "fault");
    } finally {
      setActing(null);
    }
  };

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Verification"]}>
      <h1 className="t-h1">Verification</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        {pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? "organizer has" : "organizers have"} an incomplete Razorpay Linked Account. They can't fund a booking until KYC clears.`
          : "Every organizer has cleared KYC."}
      </p>

      {loading ? (
        <p className="t-small mt-6 text-muted">Loading…</p>
      ) : organizers.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {organizers.map((organizer) => (
            <li key={organizer.id} className="flex flex-wrap items-center gap-4 px-4 py-4">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[16px] font-bold"
              >
                {organizer.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="t-h3 truncate">{organizer.name}</p>
                <p className="t-small mt-0.5 text-muted">{ORG_TYPE_LABEL[organizer.organizer_type]}</p>
                {organizer.kyc_status === "rejected" && organizer.kyc_rejection_reason && (
                  <p className="t-small mt-0.5 text-fault">Rejected: {organizer.kyc_rejection_reason}</p>
                )}
              </div>
              <Pill tone={KYC_TONE[organizer.kyc_status]}>{organizer.kyc_status}</Pill>
              {organizer.kyc_status !== "verified" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={acting === organizer.id}
                    onClick={() => approve(organizer)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={acting === organizer.id}
                    onClick={() => { setRejectTarget(organizer); setReason(""); }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="t-small mt-6 border border-dashed border-line px-4 py-8 text-center text-muted">
          No organizers yet.
        </p>
      )}

      <Modal
        open={rejectTarget !== null}
        onClose={() => { setRejectTarget(null); setReason(""); }}
        title="Reject KYC"
      >
        {rejectTarget && (
          <>
            <p className="t-body text-paper/90">
              Rejecting <strong>{rejectTarget.name}</strong>'s KYC. They won't be able to fund a
              booking until this is resolved.
            </p>
            <label htmlFor="reject-reason" className="t-micro mb-2 mt-5 block">
              Reason (shown to the organizer)
            </label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's missing or wrong with their KYC submission?"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="destructive" disabled={acting === rejectTarget.id} onClick={reject}>
                Reject
              </Button>
              <Button onClick={() => { setRejectTarget(null); setReason(""); }}>Cancel</Button>
            </div>
          </>
        )}
      </Modal>
    </ConsoleShell>
  );
}
