import { useEffect, useState } from "react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill, type PillTone } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import {
  getOrganizerKycQueue, setOrganizerKyc, type AdminOrganizer,
  getArtistKycQueue, setArtistKyc,
  getVenueKycQueue, setVenueKyc,
  type ApiArtist, type ApiVenue, type KycStatus,
} from "@/lib/api";

const KYC_TONE: Record<KycStatus, PillTone> = {
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

type Tab = "organizers" | "artists" | "venues";

/** The venue KYC queue serializes `city` fully nested ({id, name, ...}),
 * unlike the list endpoint's flat `city_name` — `ApiVenue.city` is typed as
 * a bare string for the common case, so read defensively here. */
function venueCityName(v: ApiVenue): string {
  if (v.city_name) return v.city_name;
  const city = v.city as unknown;
  if (city && typeof city === "object" && "name" in city) return String((city as { name: string }).name);
  return "No city set";
}

/** Whatever entity is active, flattened to what the shared list UI needs —
 * `key` doubles as the id/slug the approve/reject calls take. */
interface Row {
  key: string;
  name: string;
  subtitle: string;
  kyc_status: KycStatus;
  kyc_rejection_reason?: string;
}

const TABS: { id: Tab; label: string }[] = [
  { id: "organizers", label: "Organizers" },
  { id: "artists", label: "Artists" },
  { id: "venues", label: "Venues" },
];

/**
 * KYC review across every entity that can actually receive money on Naada:
 * `Organizer` (the host↔artist booking-escrow side), and now `Artist` and
 * `Venue` too — both gained real GST/PAN/bank-details/KYC fields where
 * previously there were none at all, so this is also the first place any of
 * the three can be reviewed rather than just self-reported.
 */
export function AdminVerificationScreen() {
  const { toast } = useStore();
  const [tab, setTab] = useState<Tab>("organizers");

  const [organizers, setOrganizers] = useState<AdminOrganizer[]>([]);
  const [artists, setArtists] = useState<ApiArtist[]>([]);
  const [venues, setVenues] = useState<ApiVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [reason, setReason] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      getOrganizerKycQueue().catch(() => []),
      getArtistKycQueue().catch(() => []),
      getVenueKycQueue().catch(() => []),
    ]).then(([o, a, v]) => {
      setOrganizers(o);
      setArtists(a);
      setVenues(v);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const rowsFor = (t: Tab): Row[] => {
    if (t === "organizers") {
      return organizers.map((o) => ({
        key: o.id, name: o.name, subtitle: ORG_TYPE_LABEL[o.organizer_type],
        kyc_status: o.kyc_status, kyc_rejection_reason: o.kyc_rejection_reason,
      }));
    }
    if (t === "artists") {
      return artists.map((a) => ({
        key: a.id, name: a.stage_name, subtitle: a.city_name ?? "No city set",
        kyc_status: a.kyc_status ?? "pending", kyc_rejection_reason: a.kyc_rejection_reason,
      }));
    }
    return venues.map((v) => ({
      key: v.slug ?? v.id, name: v.name, subtitle: venueCityName(v),
      kyc_status: v.kyc_status ?? "pending", kyc_rejection_reason: v.kyc_rejection_reason,
    }));
  };

  const rows = rowsFor(tab);
  const pendingCounts: Record<Tab, number> = {
    organizers: rowsFor("organizers").filter((r) => r.kyc_status !== "verified").length,
    artists: rowsFor("artists").filter((r) => r.kyc_status !== "verified").length,
    venues: rowsFor("venues").filter((r) => r.kyc_status !== "verified").length,
  };

  const approve = async (row: Row) => {
    setActing(row.key);
    try {
      if (tab === "organizers") {
        const updated = await setOrganizerKyc(row.key, "verified");
        setOrganizers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } else if (tab === "artists") {
        const updated = await setArtistKyc(row.key, "verified");
        setArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const updated = await setVenueKyc(row.key, "verified");
        setVenues((prev) => prev.map((v) => (v.slug === updated.slug ? updated : v)));
      }
      toast(`${row.name} verified`, "success");
    } catch {
      toast(`Couldn't verify ${row.name}`, "fault");
    } finally {
      setActing(null);
    }
  };

  const reject = async () => {
    if (!rejectTarget) return;
    setActing(rejectTarget.key);
    try {
      if (tab === "organizers") {
        const updated = await setOrganizerKyc(rejectTarget.key, "rejected", reason.trim());
        setOrganizers((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
      } else if (tab === "artists") {
        const updated = await setArtistKyc(rejectTarget.key, "rejected", reason.trim());
        setArtists((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        const updated = await setVenueKyc(rejectTarget.key, "rejected", reason.trim());
        setVenues((prev) => prev.map((v) => (v.slug === updated.slug ? updated : v)));
      }
      toast(`${rejectTarget.name} rejected`, "fault");
      setRejectTarget(null);
      setReason("");
    } catch {
      toast(`Couldn't reject ${rejectTarget.name}`, "fault");
    } finally {
      setActing(null);
    }
  };

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Verification"]}>
      <h1 className="t-h1">Verification</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Whoever's going to be paid — an organizer funding a booking, an artist or a venue
        collecting one — needs KYC cleared here first.
      </p>

      <div className="mt-6 flex gap-2 border-b border-line">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`t-small border-b-2 px-1 pb-2 transition-colors ${
              tab === id ? "border-signal text-paper" : "border-transparent text-muted hover:text-paper"
            }`}
          >
            {label}
            {pendingCounts[id] > 0 && <span className="ml-1.5 text-brass">({pendingCounts[id]})</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="t-small mt-6 text-muted">Loading…</p>
      ) : rows.length > 0 ? (
        <ul className="mt-6 divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {rows.map((row) => (
            <li key={row.key} className="flex flex-wrap items-center gap-4 px-4 py-4">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center glass-soft rounded-xl-2 font-display text-[16px] font-bold"
              >
                {row.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="t-h3 truncate">{row.name}</p>
                <p className="t-small mt-0.5 text-muted">{row.subtitle}</p>
                {row.kyc_status === "rejected" && row.kyc_rejection_reason && (
                  <p className="t-small mt-0.5 text-fault">Rejected: {row.kyc_rejection_reason}</p>
                )}
              </div>
              <Pill tone={KYC_TONE[row.kyc_status]}>{row.kyc_status}</Pill>
              {row.kyc_status !== "verified" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={acting === row.key}
                    onClick={() => approve(row)}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={acting === row.key}
                    onClick={() => { setRejectTarget(row); setReason(""); }}
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
          Nothing here yet.
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
              Rejecting <strong>{rejectTarget.name}</strong>'s KYC. They can't receive a payout
              until this is resolved.
            </p>
            <label htmlFor="reject-reason" className="t-micro mb-2 mt-5 block">
              Reason (shown to them)
            </label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="What's missing or wrong with the submission?"
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="destructive" disabled={acting === rejectTarget.key} onClick={reject}>
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
