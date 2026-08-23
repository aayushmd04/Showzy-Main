import { Link, useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { ConsoleShell, ADMIN_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import type { KycStatus } from "@/data/fixtures";

const ORDER: Record<KycStatus, number> = { pending: 0, rejected: 1, verified: 2 };

/**
 * Artist KYC queue — Q17 in the technical discovery. Gated at payout, not at
 * signup: artists already browse, apply and negotiate freely before this
 * ever blocks them. This is where that gate is actually decided.
 */
export function AdminVerificationScreen() {
  const navigate = useNavigate();
  const { artists, setArtistKycStatus, toast, emptyLists } = useStore();

  const rows = emptyLists
    ? []
    : [...artists].sort((a, b) => ORDER[a.kycStatus] - ORDER[b.kycStatus]);
  const pendingCount = artists.filter((a) => a.kycStatus === "pending").length;

  return (
    <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Verification"]}>
      <h1 className="t-h1">Verification</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        {pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? "artist has" : "artists have"} an incomplete Razorpay Linked Account. Funds stay held until KYC clears.`
          : "Every artist with a live booking has cleared KYC."}
      </p>

      {rows.length > 0 ? (
        <ul className="mt-6 divide-y divide-line border border-line bg-surface">
          {rows.map((artist) => (
            <li
              key={artist.id}
              className="flex flex-wrap items-center gap-4 px-4 py-4"
            >
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center border border-line bg-surface-2 font-display text-[16px] font-bold"
              >
                {artist.name.charAt(0)}
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <Link to={`/a/${artist.id}`} className="t-h3 truncate hover:text-signal">
                  {artist.name}
                </Link>
                <p className="t-small mt-0.5 flex flex-wrap items-center gap-x-3 text-muted">
                  <span className="truncate">{artist.genres.join(" · ")}</span>
                  <span className="flex items-center gap-1">
                    <Star className="size-3 fill-brass text-brass" aria-hidden="true" />
                    <span className="t-mono">{artist.rating.toFixed(1)}</span>
                  </span>
                  <span className="t-mono">{artist.gigsPlayed} gigs</span>
                </p>
              </div>
              <Pill>{artist.kycStatus}</Pill>
              {artist.kycStatus !== "verified" && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      setArtistKycStatus(artist.id, "verified");
                      toast(`${artist.name} verified`, "success");
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setArtistKycStatus(artist.id, "rejected");
                      toast(`${artist.name} rejected`, "fault");
                    }}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="Nothing to verify"
            body="Artists land here the moment they accept a first offer and need a Linked Account."
            actionLabel="Back to overview"
            onAction={() => navigate("/admin")}
          />
        </div>
      )}
    </ConsoleShell>
  );
}
