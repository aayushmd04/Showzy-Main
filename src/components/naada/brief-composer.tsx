import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useStore } from "@/store/app-store";
import { PLATFORM_FEE_RATE } from "@/data/fixtures";
import { dateCompact, money } from "@/lib/format";

/**
 * Section 7.12. The fee breakdown is mandatory: the artist receives the full
 * quote and the host pays the 7% on top. That is the product's core commercial
 * promise, so the prototype has to make it legible.
 */

interface BriefApi {
  open: (artistId: string, eventId?: string) => void;
}

const BriefContext = createContext<BriefApi | null>(null);

export function BriefComposerProvider({ children }: { children: ReactNode }) {
  const { artists, events, sendBrief, toast } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [eventId, setEventId] = useState("");
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");

  const bookable = useMemo(
    () => events.filter((e) => e.status === "draft" || e.status === "published"),
    [events],
  );

  const openComposer = useCallback(
    (nextArtistId: string, nextEventId?: string) => {
      const artist = artists.find((a) => a.id === nextArtistId);
      setArtistId(nextArtistId);
      setEventId(nextEventId ?? bookable[0]?.id ?? "");
      setAmount(String(artist?.feeMin ?? 4000));
      setMessage("90 minute set, two halves. Backline provided, load-in from 6pm.");
      setOpen(true);
    },
    [artists, bookable],
  );

  const api = useMemo<BriefApi>(() => ({ open: openComposer }), [openComposer]);
  const artist = artists.find((a) => a.id === artistId);
  const offer = Number(amount.replace(/[^\d]/g, "")) || 0;
  const platformFee = Math.round(offer * PLATFORM_FEE_RATE);
  const firstName = artist?.name.split(" ")[0] ?? "the artist";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!artist || !eventId) return;
    const booking = sendBrief({ eventId, artistId: artist.id, amount: offer, message });
    setOpen(false);
    toast(`Brief sent to ${artist.name}`, "success");
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
          <Select
            id="brief-event"
            value={eventId}
            onChange={setEventId}
            options={bookable.map((e) => ({
              value: e.id,
              label: `${e.name} · ${dateCompact(e.date)}`,
            }))}
          />

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
            {artist && (
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
            <Row label={`Platform fee (${Math.round(PLATFORM_FEE_RATE * 100)}%)`} value={money(platformFee)} />
            <Row label="You pay" value={money(offer + platformFee)} strong />
            <Row label={`${firstName} receives`} value={money(offer)} tone="live" />
          </dl>

          <Button type="submit" variant="primary" full className="mt-5" disabled={offer <= 0}>
            Send brief
          </Button>
          <p className="t-small mt-3 text-center text-muted">
            Naada takes no fee from artists.
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
