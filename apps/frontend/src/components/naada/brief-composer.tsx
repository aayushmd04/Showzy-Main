import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import { PLATFORM_FEE_RATE, TDS_RATE } from "@/data/fixtures";
import { dateCompact, money } from "@/lib/format";
import { getMyEvents, sendOfferToArtist, type ApiEvent } from "@/lib/api";
import { actionError } from "./api-message";

/**
 * Section 7.12. The fee breakdown is mandatory: the artist receives the full
 * quote and the host pays the 7% on top. That is the product's core commercial
 * promise, so the prototype has to make it legible.
 */

interface BriefApi {
  open: (artistId: string, eventId?: string) => void;
}

const BriefContext = createContext<BriefApi | null>(null);

interface OwnEvent {
  id: string;
  name: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  venue: string;
}

function ownEventOf(e: ApiEvent): OwnEvent {
  const d = new Date(e.start_datetime);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    id: e.id,
    name: e.title,
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    venue: e.venue_name ?? (typeof e.venue === "object" ? e.venue?.name : "") ?? "",
  };
}

export function BriefComposerProvider({ children }: { children: ReactNode }) {
  const { artists, sendBrief, toast, currentUser } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [eventId, setEventId] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  /** The host's own events — an offer is for a night the host is actually running. null = still loading. */
  const [ownEvents, setOwnEvents] = useState<OwnEvent[] | null>(null);

  const openComposer = useCallback(
    (nextArtistId: string, nextEventId?: string) => {
      const artist = artists.find((a) => a.id === nextArtistId);
      setArtistId(nextArtistId);
      setEventId("");
      setOwnEvents(null);
      setAmount(String(artist?.feeMin || ""));
      setMessage("90 minute set, two halves. Backline provided, load-in from 6pm.");
      setSendError("");
      setOpen(true);
      getMyEvents()
        .then((data) => {
          const mine = data.results.filter((e) => e.status === "draft" || e.status === "published").map(ownEventOf);
          setOwnEvents(mine);
          setEventId(mine.find((e) => e.id === nextEventId)?.id ?? mine[0]?.id ?? "");
        })
        .catch((err: unknown) => {
          setOwnEvents([]);
          setSendError(actionError(err, "load your events"));
        });
    },
    [artists],
  );

  const api = useMemo<BriefApi>(() => ({ open: openComposer }), [openComposer]);
  const artist = artists.find((a) => a.id === artistId);
  const offer = Number(amount.replace(/[^\d]/g, "")) || 0;
  const platformFee = Math.round(offer * PLATFORM_FEE_RATE);
  const tds = Math.round(offer * TDS_RATE);
  const firstName = artist?.name.split(" ")[0] ?? "the artist";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const event = ownEvents?.find((ev) => ev.id === eventId);
    if (!artist || !event || sending) return;
    setSending(true);
    setSendError("");
    try {
      // Send it to the server first. The artist is notified from there, so a
      // brief that only ever existed in this browser would reach nobody.
      await sendOfferToArtist({
        artistId: artist.id,
        eventId: event.id,
        organizerName: event.venue || currentUser?.full_name || "My venue",
        feeAmount: offer,
        performanceDate: event.date,
        notes: message.trim(),
      });
    } catch (err) {
      setSendError(actionError(err, `send your offer to ${artist.name}`));
      setSending(false);
      return;
    }
    const booking = sendBrief({ eventId, artistId: artist.id, amount: offer, message });
    setSending(false);
    setOpen(false);
    toast(`Offer sent to ${artist.name} — they've been notified`, "success");
    navigate(`/bookings/${booking.id}`);
  };

  return (
    <BriefContext.Provider value={api}>
      {children}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={artist ? `Send a brief to ${artist.name}` : "Send a brief"}
      >
        <form onSubmit={submit}>
          <Label htmlFor="brief-event">For which event?</Label>
          {ownEvents !== null && ownEvents.length === 0 ? (
            <p className="t-small border border-dashed border-line px-3 py-3 text-muted">
              You don't have an upcoming event to book for yet.{" "}
              <Link to="/host/events/new" className="underline" onClick={() => setOpen(false)}>
                Create one first
              </Link>
              .
            </p>
          ) : (
            <Select
              id="brief-event"
              value={eventId}
              onChange={setEventId}
              options={
                ownEvents === null
                  ? [{ value: "", label: "Loading your events…" }]
                  : ownEvents.map((e) => ({
                      value: e.id,
                      label: `${e.name} · ${dateCompact(e.date)}`,
                    }))
              }
            />
          )}

          <div className="mt-5">
            <Label htmlFor="brief-amount">Your offer</Label>
            <div className="flex items-stretch gap-2">
              <span className="t-mono grid w-11 place-items-center border border-line bg-ink text-[15px] text-muted">
                ₹
              </span>
              <Input
                id="brief-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                className="t-mono flex-1"
                required
              />
            </div>
            {artist && artist.feeMax > 0 && (
              <p className="t-small mt-2 text-muted">
                Their usual range is{" "}
                <span className="t-mono">
                  {money(artist.feeMin)}–{money(artist.feeMax)}
                </span>
              </p>
            )}
          </div>

          <div className="mt-5">
            <Label htmlFor="brief-message">Message</Label>
            <Textarea
              id="brief-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
            />
          </div>

          <dl className="mt-5 border border-line bg-ink p-4">
            <Row label={`Showzy fee (${Math.round(PLATFORM_FEE_RATE * 100)}%, added for you)`} value={money(platformFee)} />
            <Row label="You pay" value={money(offer + platformFee)} strong />
            <Row label={`${firstName} receives, after ${Math.round(TDS_RATE * 100)}% TDS`} value={money(offer - tds)} tone="live" />
          </dl>

          {sendError && (
            <p className="t-small mt-4 border border-fault bg-surface px-3 py-2 text-fault" role="alert">
              {sendError}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            full
            className="mt-5"
            disabled={offer <= 0 || !eventId || sending}
          >
            {sending ? "Sending…" : "Send brief"}
          </Button>
          <p className="t-small mt-3 text-center text-muted">
            You pay Showzy's {Math.round(PLATFORM_FEE_RATE * 100)}% fee on top; the artist is not charged.
          </p>
        </form>
      </Modal>
    </BriefContext.Provider>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "live";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <dt className={strong ? "text-[15px]" : "t-small text-muted"}>{label}</dt>
      <dd
        className={`t-mono ${strong ? "text-[17px] font-medium" : "text-[14px]"} ${
          tone === "live" ? "text-live" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export function useBriefComposer(): BriefApi {
  const ctx = useContext(BriefContext);
  if (!ctx) throw new Error("useBriefComposer must be used inside <BriefComposerProvider>");
  return ctx;
}
