import { useEffect, useState } from "react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Field, Input, Label } from "@/components/ui/input";
import { Pill, type PillTone } from "@/components/ui/pill";
import { useHostBranch } from "@/components/naada/host-branch";
import { getMyVenues, updateVenue } from "@/lib/api";
import type { ApiVenue } from "@/lib/api";

const KYC_TONE: Record<string, PillTone> = {
  pending: "muted",
  submitted: "brass",
  verified: "live",
  rejected: "fault",
};

/** The editable half of a venue's compliance/payout details. */
interface Draft {
  gst_number: string;
  pan_number: string;
  bank_account_holder_name: string;
  /** Always starts blank — the server never sends the real number back.
   * Non-blank means "replace what's on file"; blank on save means "leave
   * it alone". */
  bank_account_number: string;
  bank_ifsc_code: string;
  bank_name: string;
}

function draftOf(venue: ApiVenue): Draft {
  return {
    gst_number: venue.gst_number ?? "",
    pan_number: venue.pan_number ?? "",
    bank_account_holder_name: venue.bank_account_holder_name ?? "",
    bank_account_number: "",
    bank_ifsc_code: venue.bank_ifsc_code ?? "",
    bank_name: venue.bank_name ?? "",
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.gst_number === b.gst_number &&
    a.pan_number === b.pan_number &&
    a.bank_account_holder_name === b.bank_account_holder_name &&
    a.bank_ifsc_code === b.bank_ifsc_code &&
    a.bank_name === b.bank_name &&
    a.bank_account_number.trim() === ""
  );
}

/**
 * A venue's GST/PAN/KYC/bank details — the venue-side twin of the artist
 * profile builder's "Business & payouts" section. There was previously no
 * venue-settings screen of any kind beyond the floor-plan designer, so this
 * is also the first place a host can see their venue's KYC status at all.
 */
export function HostVenueBusinessScreen() {
  const branch = useHostBranch();
  const [venue, setVenue] = useState<ApiVenue | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "no-venue" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = () => {
    setLoadState("loading");
    getMyVenues()
      .then((venues) => {
        const mine = venues.find((v) => v.id === branch.current?.id) ?? venues[0];
        if (!mine) {
          setLoadState("no-venue");
          return;
        }
        setVenue(mine);
        const next = draftOf(mine);
        setDraft(next);
        setSaved(next);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  };

  // Reload when the host picks another branch.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [branch.current?.id]);

  const dirty = Boolean(draft && saved && !sameDraft(draft, saved));
  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...changes } : d));
    setSaveError("");
  };

  const save = async () => {
    if (!venue || !draft) return;
    setSaving(true);
    setSaveError("");
    try {
      const updated = await updateVenue(venue.slug!, {
        gst_number: draft.gst_number.trim(),
        pan_number: draft.pan_number.trim(),
        bank_account_holder_name: draft.bank_account_holder_name.trim(),
        ...(draft.bank_account_number.trim()
          ? { bank_account_number: draft.bank_account_number.trim() }
          : {}),
        bank_ifsc_code: draft.bank_ifsc_code.trim(),
        bank_name: draft.bank_name.trim(),
      });
      setVenue(updated);
      const confirmed = draftOf(updated);
      setDraft(confirmed);
      setSaved(confirmed);
      setSavedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "That didn't save — check the details and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loadState !== "ready" || !venue || !draft) {
    return (
      <ConsoleShell nav={HOST_NAV} breadcrumb={["Business"]}>
        <h1 className="t-h1">Business &amp; payouts</h1>
        {loadState === "loading" && (
          <p className="t-body mt-6 border border-dashed border-line px-4 py-12 text-center text-muted">
            Loading…
          </p>
        )}
        {loadState === "no-venue" && (
          <div className="mt-6 max-w-[46ch] glass-soft rounded-xl p-5">
            <h2 className="t-h3">No venue yet</h2>
            <p className="t-body mt-2 text-muted">
              GST, PAN and payout details live on your venue record, and there isn't one on this
              account yet.
            </p>
          </div>
        )}
        {loadState === "error" && (
          <div className="mt-6 border border-fault bg-surface p-5">
            <p className="t-body">Your venue's details didn't load.</p>
            <Button variant="primary" className="mt-4" onClick={load}>
              Try again
            </Button>
          </div>
        )}
      </ConsoleShell>
    );
  }

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Business"]}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h1">Business &amp; payouts</h1>
          <p className="t-body mt-2 max-w-[52ch] text-muted">
            GST, PAN and {venue.name}'s bank account — what a ticket-sale payout actually needs.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </Button>
          <span className="t-mono text-[12px] text-muted" aria-live="polite">
            {dirty ? "Unsaved changes" : savedAt ? `Saved ${savedAt}` : "Everything here is live"}
          </span>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3 glass-soft rounded-xl px-4 py-3">
        <div>
          <p className="t-small text-muted">KYC status</p>
          {venue.kyc_status === "rejected" && venue.kyc_rejection_reason && (
            <p className="t-small mt-1 text-fault">Rejected: {venue.kyc_rejection_reason}</p>
          )}
        </div>
        <Pill tone={KYC_TONE[venue.kyc_status ?? "pending"]}>{venue.kyc_status ?? "pending"}</Pill>
      </div>
      <p className="t-small mt-2 text-muted">
        Saving GST, PAN or bank details sends this venue's KYC for review — nothing is paid out
        until it's verified.
      </p>

      {saveError && (
        <p className="t-small mt-4 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
          {saveError}
        </p>
      )}

      <div className="mt-6 max-w-[520px] space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" htmlFor="hv-gst" hint="Optional — only if you're GST-registered">
            <Input
              id="hv-gst"
              value={draft.gst_number}
              onChange={(e) => patch({ gst_number: e.target.value.toUpperCase() })}
              placeholder="22AAAAA0000A1Z5"
              className="t-mono"
              maxLength={15}
            />
          </Field>
          <Field label="PAN" htmlFor="hv-pan" hint="Needed for TDS on payouts">
            <Input
              id="hv-pan"
              value={draft.pan_number}
              onChange={(e) => patch({ pan_number: e.target.value.toUpperCase() })}
              placeholder="ABCDE1234F"
              className="t-mono"
              maxLength={10}
            />
          </Field>
        </div>

        <div>
          <Label>Payout bank account</Label>
          <div className="mt-2 grid gap-4 sm:grid-cols-2">
            <Field label="Account holder name" htmlFor="hv-bank-holder">
              <Input
                id="hv-bank-holder"
                value={draft.bank_account_holder_name}
                onChange={(e) => patch({ bank_account_holder_name: e.target.value })}
              />
            </Field>
            <Field label="Bank name" htmlFor="hv-bank-name">
              <Input
                id="hv-bank-name"
                value={draft.bank_name}
                onChange={(e) => patch({ bank_name: e.target.value })}
              />
            </Field>
            <Field
              label="Account number"
              htmlFor="hv-bank-account"
              hint={
                venue.has_bank_details
                  ? `On file, ending in ${venue.bank_account_last4}. Leave blank to keep it.`
                  : "Not on file yet."
              }
            >
              <Input
                id="hv-bank-account"
                inputMode="numeric"
                value={draft.bank_account_number}
                onChange={(e) => patch({ bank_account_number: e.target.value.replace(/\D/g, "") })}
                placeholder={venue.has_bank_details ? "Enter a new number to replace it" : ""}
                className="t-mono"
              />
            </Field>
            <Field label="IFSC code" htmlFor="hv-bank-ifsc">
              <Input
                id="hv-bank-ifsc"
                value={draft.bank_ifsc_code}
                onChange={(e) => patch({ bank_ifsc_code: e.target.value.toUpperCase() })}
                placeholder="HDFC0001234"
                className="t-mono"
                maxLength={11}
              />
            </Field>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-line pt-5">
          <Button variant="primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {dirty && (
            <Button onClick={() => { setDraft(saved); setSaveError(""); }} disabled={saving}>
              Discard
            </Button>
          )}
        </div>
      </div>
    </ConsoleShell>
  );
}
