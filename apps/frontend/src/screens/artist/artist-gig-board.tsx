import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConsoleShell, ARTIST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { EmptyState } from "@/components/naada/empty-state";
import { useStore } from "@/store/app-store";
import { applyToGig as apiApplyToGig } from "@/lib/api";
import { today, dateListing, money } from "@/lib/format";

const OPEN_STATUS_LABEL = {
  pending: "Applied",
  shortlisted: "Shortlisted",
  declined: "Declined",
  withdrawn: "Withdrawn",
  converted: "In negotiation",
} as const;

/**
 * Gig board — artists browse open events and apply; a host review queue
 * (host-event-manager.tsx) is the other side of this. Distinct from "Gigs",
 * which only lists bookings that already exist.
 */
export function ArtistGigBoardScreen() {
  const navigate = useNavigate();
  const { events, venueOf, applications, applyToGig, artists, toast, emptyLists } = useStore();
  const me = artists[0];
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rate, setRate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const open = events.find((e) => e.id === openEventId);

  const board = emptyLists
    ? []
    : events
        .filter((e) => e.status === "published" && e.isSeekingArtist && e.date >= today())
        .sort((a, b) => a.date.localeCompare(b.date));

  const myApplication = (eventId: string) =>
    applications.find((a) => a.eventId === eventId && a.artistId === me.id);

  const startApply = (eventId: string) => {
    setOpenEventId(eventId);
    setMessage("I'd love to play this one — let me know if it's still open.");
    setRate(String(me.feeMin));
  };

  const submit = async () => {
    if (!open) return;
    setSubmitting(true);
    try {
      await apiApplyToGig({
        event: open.id,
        note: message,
        proposed_fee: Number(rate.replace(/\D/g, "")) || undefined,
      });
      applyToGig(open.id, me?.id ?? "", message, Number(rate.replace(/\D/g, "")) || undefined);
      toast(`Applied to ${open.name}`, "success");
      setOpenEventId(null);
    } catch {
      toast("Could not submit application — try again", "fault");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Gig board"]}>
      <h1 className="t-h1">Gig board</h1>
      <p className="t-body mt-2 max-w-[56ch] text-muted">
        Hosts with an open slot and a budget post it here. Apply with a rate and a note —
        they'll shortlist or start a chat directly.
      </p>

      {board.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {board.map((event) => {
            const venue = venueOf(event);
            const mine = myApplication(event.id);
            return (
              <li key={event.id} className="border border-line bg-surface p-4">
                <p className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  {dateListing(event.date)}
                </p>
                <p className="t-h3 mt-1">{event.name}</p>
                <p className="t-small mt-1 text-muted">
                  {venue?.name} · {venue?.area}
                </p>
                {(event.budgetMin || event.budgetMax) && (
                  <p className="t-mono mt-2 text-[14px] text-brass">
                    {money(event.budgetMin ?? 0)}–{money(event.budgetMax ?? 0)}
                  </p>
                )}
                <div className="mt-4">
                  {mine ? (
                    <Pill tone={mine.status === "declined" ? "fault" : "paper"}>
                      {OPEN_STATUS_LABEL[mine.status]}
                    </Pill>
                  ) : (
                    <Button size="sm" variant="primary" onClick={() => startApply(event.id)}>
                      Apply
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            headline="No open slots right now"
            body="Hosts post here when they have budget and a date but no artist yet. Check back, or keep your profile sharp for direct offers."
            actionLabel="Go to your profile"
            onAction={() => navigate("/artist/profile")}
          />
        </div>
      )}

      <Modal open={Boolean(open)} onClose={() => setOpenEventId(null)} title={open ? `Apply to ${open.name}` : "Apply"}>
        {open && (
          <>
            {(open.budgetMin || open.budgetMax) && (
              <p className="t-small text-muted">
                Host's budget:{" "}
                <span className="t-mono text-brass">
                  {money(open.budgetMin ?? 0)}–{money(open.budgetMax ?? 0)}
                </span>
              </p>
            )}
            <label htmlFor="apply-rate" className="t-micro mb-2 mt-4 block">
              Your rate
            </label>
            <div className="flex items-stretch gap-2">
              <span className="t-mono grid w-11 place-items-center border border-line bg-ink text-[15px] text-muted">
                ₹
              </span>
              <input
                id="apply-rate"
                inputMode="numeric"
                value={rate}
                onChange={(e) => setRate(e.target.value.replace(/\D/g, ""))}
                className="field t-mono flex-1"
              />
            </div>
            <label htmlFor="apply-message" className="t-micro mb-2 mt-4 block">
              Message
            </label>
            <Textarea
              id="apply-message"
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <Button variant="primary" full className="mt-5" onClick={submit} disabled={!rate || submitting}>
              Send application
            </Button>
          </>
        )}
      </Modal>
    </ConsoleShell>
  );
}
