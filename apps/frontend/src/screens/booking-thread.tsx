import { useState, useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ShieldCheck, Star } from "lucide-react";
import { usePageMeta } from "@/lib/use-meta";
import { ConsoleShell, ADMIN_NAV, ARTIST_NAV, HOST_NAV } from "@/components/naada/console-shell";
import { StateToggle } from "@/components/naada/state-toggle";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill, statusLabel } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { useConversationMessages } from "@/hooks/use-api";
import type { ChatMessage } from "@/data/fixtures";
import {
  MAX_COUNTERS,
  PLATFORM_FEE_RATE,
  TDS_RATE,
  type BookingState,
  type DisputeResolution,
} from "@/data/fixtures";
import { dateListing, money, quoteStamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "./not-found";

const STATES: BookingState[] = [
  "requested",
  "negotiating",
  "accepted",
  "funded",
  "released",
  "cancelled",
  "disputed",
];

/**
 * Section 7.13 — one screen shared by Host and Artist with role-conditional
 * actions. Built once, rendered inside whichever console the viewer is in.
 */
export function BookingThreadScreen() {
  const { id = "" } = useParams();
  usePageMeta({ title: "Booking" });
  const navigate = useNavigate();
  const {
    bookingById,
    eventById,
    artistById,
    venueOf,
    role,
    currentUser,
    counterBooking,
    acceptBooking,
    declineBooking,
    fundBooking,
    setBookingState,
    countersUsed,
    messagesFor,
    sendMessage,
    apiSendMessage,
    reviewsFor,
    submitReview,
    toast,
  } = useStore();
  const [counter, setCounter] = useState("");
  const [fundOpen, setFundOpen] = useState(false);
  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const reduce = useReducedMotion();
  const chatEndRef = useRef<HTMLLIElement>(null);

  const booking = bookingById(id);

  // Live message polling for real conversations (UUIDs) vs fixture bookings (b1, b2 etc.)
  const isRealConvo = booking && /^[0-9a-f-]{36}$/.test(booking.id);
  const { data: liveMessages } = useConversationMessages(isRealConvo ? booking.id : null);

  const storeMessages = booking ? messagesFor(booking.id) : [];
  const chatThread: ChatMessage[] = isRealConvo && liveMessages
    ? liveMessages.results.map((m) => ({
        id: m.id,
        bookingId: booking!.id,
        sender: "host" as const,
        body: m.content,
        at: m.created_at,
        flagged: m.is_flagged,
      }))
    : storeMessages;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatThread.length]);

  if (!booking) return <NotFoundScreen />;

  const event = eventById(booking.eventId);
  const artist = artistById(booking.artistId);
  const venue = event ? venueOf(event) : undefined;
  const isAdmin = role === "admin";
  const viewerIsHost = role === "host" || isAdmin;
  const viewer: "host" | "artist" = viewerIsHost ? "host" : "artist";
  const myDirection = viewer === "host" ? "host_to_artist" : "artist_to_host";
  const myReview = reviewsFor(booking.id).find((r) => r.direction === myDirection);

  const used = countersUsed(booking);
  const countersLeft = Math.max(0, MAX_COUNTERS - used);
  const lastQuote = booking.quotes[booking.quotes.length - 1];
  const standing = booking.agreedFee ?? lastQuote?.amount ?? 0;
  const platformFee = Math.round(standing * PLATFORM_FEE_RATE);
  // TDS is deducted from the artist's side only; the venue never sees it.
  const tds = Math.round(standing * TDS_RATE);

  // Section 7.13 action table: on a request only the artist can act; once the
  // thread is negotiating, either side can counter, accept or decline.
  const canAct =
    booking.state === "negotiating" || (booking.state === "requested" && !viewerIsHost);

  const banner =
    booking.state === "negotiating" || booking.state === "requested"
      ? countersLeft === 0
        ? "No counters left — accept or decline"
        : `${statusLabel(booking.state)} · ${used} of ${MAX_COUNTERS} counters used`
      : statusLabel(booking.state);

  const submitCounter = () => {
    const amount = Number(counter.replace(/\D/g, ""));
    if (!amount) return;
    counterBooking(booking.id, viewer, amount);
    setCounter("");
    toast(`Countered with ${money(amount)}`);
  };

  const body = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() =>
              navigate(isAdmin ? "/admin/disputes" : viewerIsHost ? "/host/bookings" : "/artist/offers")
            }
            className="flex min-h-11 items-center gap-2 text-[14px] text-muted transition-colors hover:text-paper"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Back
          </button>
          <h1 className="t-h1 mt-1 break-words">
            {event?.name} · {artist?.name}
          </h1>
          <p className="t-body mt-2 text-muted">
            {venue?.name} · {event ? dateListing(event.date) : ""} ·{" "}
            <span className="t-mono">{event?.time}</span>
          </p>
        </div>
        {!isAdmin && (
          <StateToggle
            value={booking.state}
            options={STATES}
            onChange={(next) => {
              // Q17/Q18 — release (however it's triggered) never fires for an
              // artist who hasn't cleared KYC. Funds stay held; the doc's
              // production behaviour is a nudge, then an auto-refund at 14
              // days, not a silent payout to an unverified payee.
              const releasing = next === "released" || next === "performed";
              if (releasing && artist?.kycStatus !== "verified") {
                toast(`${artist?.name} hasn't completed KYC yet — payout stays held`, "fault");
                return;
              }
              setBookingState(booking.id, next);
              toast(`Booking set to ${next}`);
            }}
          />
        )}
      </div>

      {/* Status banner */}
      <div
        className={cn(
          "mt-6 flex flex-wrap items-center justify-between gap-3 border px-4 py-3",
          booking.state === "released" || booking.state === "funded"
            ? "border-brass"
            : booking.state === "cancelled" || booking.state === "declined" || booking.state === "disputed"
              ? "border-fault"
              : "border-line",
        )}
      >
        <p className="t-mono text-[12px] uppercase tracking-[0.08em]">{banner}</p>
        <Pill>{statusLabel(booking.state)}</Pill>
      </div>

      {booking.message && (
        <p className="t-small mt-4 border-l-2 border-line pl-4 text-muted">
          “{booking.message}”
        </p>
      )}

      {/* Quote thread */}
      <ol className="mt-6 space-y-3">
        {booking.quotes.map((quote, i) => {
          const fromHost = quote.by === "host";
          const who = fromHost
            ? (role === "host" ? currentUser?.full_name?.split(" ")[0] ?? "You" : "Organizer")
            : artist?.name.split(" ")[0];
          return (
            <motion.li
              key={`${quote.at}-${i}`}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 0.25, delay: reduce ? 0 : i * 0.04 }}
              className={cn("flex", fromHost ? "justify-start" : "justify-end")}
            >
              <div
                className={cn(
                  "w-[min(280px,80%)] border bg-surface p-4",
                  quote.accepted ? "border-live" : "border-line",
                )}
              >
                <p className="t-micro">
                  {who} {quote.accepted ? "accepted" : i === 0 ? "offered" : "countered"}
                </p>
                <p className="t-mono mt-1.5 text-[24px] font-medium">{money(quote.amount)}</p>
                <p className="t-mono mt-1 text-[12px] text-muted">{quoteStamp(quote.at)}</p>
              </div>
            </motion.li>
          );
        })}
      </ol>

      {/* Fee breakdown — the commercial promise, on both sides of the table */}
      <dl className="mt-6 border border-line bg-surface p-4">
        <div className="flex justify-between gap-4 py-1">
          <dt className="t-small text-muted">
            {booking.agreedFee ? "Agreed fee" : "Standing offer"}
          </dt>
          <dd className="t-mono text-[15px]">{money(standing)}</dd>
        </div>
        <div className="flex justify-between gap-4 py-1">
          <dt className="t-small text-muted">
            Showzy fee ({Math.round(PLATFORM_FEE_RATE * 100)}%, paid by the venue)
          </dt>
          <dd className="t-mono text-[15px]">{money(platformFee)}</dd>
        </div>
        {!viewerIsHost && (
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">TDS ({Math.round(TDS_RATE * 100)}%, deducted from the artist)</dt>
            <dd className="t-mono text-[15px]">−{money(tds)}</dd>
          </div>
        )}
        {isAdmin ? (
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-[15px]">Total (host pays; artist receives {money(standing - tds)})</dt>
            <dd className="t-mono text-[17px] font-medium">{money(standing + platformFee)}</dd>
          </div>
        ) : viewerIsHost ? (
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-[15px]">You pay</dt>
            <dd className="t-mono text-[17px] font-medium">{money(standing + platformFee)}</dd>
          </div>
        ) : (
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-[15px]">You receive</dt>
            <dd className="t-mono text-[17px] font-medium text-live">{money(standing - tds)}</dd>
          </div>
        )}
      </dl>

      {(booking.state === "disputed" || booking.resolution) && (
        <div className="mt-6 border border-fault bg-surface p-4">
          <p className="t-h3 text-fault">
            {booking.resolution ? "Dispute resolved" : "Dispute open"}
          </p>
          {booking.disputeReason && (
            <p className="t-small mt-2 text-paper/90">
              Raised by {booking.disputedBy === "artist" ? artist?.name : "the host"}:{" "}
              {booking.disputeReason}
            </p>
          )}
          {booking.resolution && (
            <p className="t-small mt-2 text-muted">
              {booking.resolution.outcome === "release" ? "Released to artist" : "Refunded to host"}{" "}
              by {booking.resolution.by} — “{booking.resolution.note}”
            </p>
          )}
          {isAdmin && !booking.resolution && (
            <Link to="/admin/disputes" className="btn btn-primary btn-sm mt-3">
              Resolve in disputes queue
            </Link>
          )}
        </div>
      )}

      {/* Chat — free-text negotiation alongside the structured quote thread.
          Screened for contact info so a deal can't quietly move off-platform. */}
      <section className="mt-6 border-t border-line pt-5">
        <h2 className="t-micro">Chat</h2>
        <ol className="mt-3 max-h-[360px] space-y-2 overflow-y-auto">
          {chatThread.length === 0 && (
            <li className="t-small border border-dashed border-line px-4 py-6 text-center text-muted">
              No messages yet.
            </li>
          )}
          {chatThread.map((m) => {
            const fromHost = m.sender === "host";
            return (
              <li key={m.id} className={cn("flex", fromHost ? "justify-start" : "justify-end")}>
                <div
                  className={cn(
                    "w-[min(320px,85%)] border bg-surface p-3",
                    m.flagged ? "border-brass" : "border-line",
                  )}
                >
                  <p className="t-small text-paper/90">{m.body}</p>
                  <p className="t-mono mt-1 text-[11px] text-muted">{quoteStamp(m.at)}</p>
                  {m.flagged && (
                    <p className="t-small mt-1.5 flex items-center gap-1.5 text-brass">
                      <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                      Flagged — {m.flagReason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
          <li ref={chatEndRef} aria-hidden="true" />
        </ol>

        {!isAdmin && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const text = chatDraft.trim();
              if (!text || sending) return;
              setSending(true);
              try {
                if (isRealConvo) {
                  const sent = await apiSendMessage(booking.id, text);
                  if (sent.flagged) toast("Message sent — flagged for review", "fault");
                } else {
                  const sent = sendMessage(booking.id, viewer, text);
                  if (sent.flagged) toast("Message sent — flagged for review", "fault");
                }
                setChatDraft("");
              } finally {
                setSending(false);
              }
            }}
          >
            <label htmlFor="chat-draft" className="sr-only">
              Message
            </label>
            <Input
              id="chat-draft"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Write a message…"
              className="flex-1"
            />
            <Button type="submit" disabled={!chatDraft.trim() || sending}>
              {sending ? "…" : "Send"}
            </Button>
          </form>
        )}
      </section>

      {/* Role-conditional action bar */}
      <div className="mt-6 border-t border-line pt-5">
        <ActionBar
          state={booking.state}
          viewerIsHost={viewerIsHost}
          isAdmin={isAdmin}
          resolution={booking.resolution}
          canAct={canAct}
          countersLeft={countersLeft}
          standing={standing}
          counter={counter}
          setCounter={setCounter}
          onCounter={submitCounter}
          onAccept={() => {
            acceptBooking(booking.id, viewer);
            toast(`Accepted ${money(standing)}`, "success");
          }}
          onDecline={() => {
            declineBooking(booking.id);
            toast("Booking declined", "fault");
          }}
          onFund={() => setFundOpen(true)}
        />

        <p className="t-small mt-4 flex items-center gap-2 text-muted">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Keep it on Showzy. Payment is only protected for bookings arranged here.
        </p>
      </div>

      {!isAdmin && booking.state === "released" && (
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="t-micro">
            {viewerIsHost ? `Rate ${artist?.name}` : "Rate the host"}
          </h2>
          {myReview ? (
            <div className="mt-3 border border-line bg-surface p-4">
              <div className="flex items-center gap-1" aria-label={`${myReview.rating} out of 5 stars`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn("size-4", n <= myReview.rating ? "fill-brass text-brass" : "text-line")}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <p className="t-small mt-2 text-paper/90">{myReview.body}</p>
            </div>
          ) : (
            <div className="mt-3 border border-line bg-surface p-4">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating out of 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={reviewRating === n}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    onClick={() => setReviewRating(n)}
                    className="grid size-9 place-items-center"
                  >
                    <Star
                      className={cn("size-5", n <= reviewRating ? "fill-brass text-brass" : "text-line")}
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
              <Textarea
                aria-label="Review"
                rows={2}
                className="mt-2"
                placeholder={viewerIsHost ? "How was the gig?" : "How was working with the host?"}
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
              />
              <Button
                size="sm"
                variant="primary"
                className="mt-2"
                onClick={() => {
                  submitReview(booking.id, myDirection, reviewRating, reviewBody.trim());
                  toast("Review submitted", "success");
                }}
              >
                Submit review
              </Button>
            </div>
          )}
        </section>
      )}

      <Modal open={fundOpen} onClose={() => setFundOpen(false)} title="Fund escrow">
        <p className="t-body text-paper/90">
          {money(standing + platformFee)} goes into escrow now. {artist?.name} receives{" "}
          {money(standing - tds)} (their fee less {Math.round(TDS_RATE * 100)}% TDS) 72 hours after the
          gig; Showzy keeps its {money(platformFee)} fee. You can cancel until the event starts.
        </p>
        <dl className="mt-5 border border-line bg-ink p-4">
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">Artist's agreed fee</dt>
            <dd className="t-mono text-[14px]">{money(standing)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">
              Showzy fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
            </dt>
            <dd className="t-mono text-[14px]">{money(platformFee)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-[15px]">You pay</dt>
            <dd className="t-mono text-[17px] font-medium">{money(standing + platformFee)}</dd>
          </div>
        </dl>
        <Button
          variant="primary"
          full
          className="mt-5"
          onClick={() => {
            fundBooking(booking.id);
            setFundOpen(false);
            toast("Escrow funded", "success");
          }}
        >
          Fund {money(standing + platformFee)}
        </Button>
      </Modal>
    </>
  );

  if (isAdmin) {
    return (
      <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Disputes", artist?.name ?? "Booking"]}>
        {body}
      </ConsoleShell>
    );
  }

  return viewerIsHost ? (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Bookings", artist?.name ?? "Booking"]}>
      {body}
    </ConsoleShell>
  ) : (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Offers", event?.name ?? "Offer"]}>
      {body}
    </ConsoleShell>
  );
}

function ActionBar({
  state,
  viewerIsHost,
  isAdmin,
  resolution,
  canAct,
  countersLeft,
  standing,
  counter,
  setCounter,
  onCounter,
  onAccept,
  onDecline,
  onFund,
}: {
  state: BookingState;
  viewerIsHost: boolean;
  isAdmin: boolean;
  resolution?: DisputeResolution;
  canAct: boolean;
  countersLeft: number;
  standing: number;
  counter: string;
  setCounter: (v: string) => void;
  onCounter: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onFund: () => void;
}) {
  if (isAdmin) {
    return resolution ? (
      <p className="t-body text-muted">
        Resolved — {resolution.outcome === "release" ? "released to artist" : "refunded to host"}.
      </p>
    ) : (
      <p className="t-body text-muted">Read-only. Resolve this booking from the disputes queue.</p>
    );
  }

  if (state === "accepted") {
    return viewerIsHost ? (
      <Button variant="primary" onClick={onFund}>
        Fund escrow
      </Button>
    ) : (
      <p className="t-body text-muted">Waiting for the host to fund escrow.</p>
    );
  }

  if (state === "funded") {
    return viewerIsHost ? (
      <Button variant="destructive" onClick={onDecline}>
        Cancel booking
      </Button>
    ) : (
      <p className="t-body text-live">Escrow funded — you'll be paid after the gig.</p>
    );
  }

  if (state === "released" || state === "performed") {
    return (
      <p className="t-body text-live">
        Paid · <span className="t-mono">{money(standing)}</span>
      </p>
    );
  }

  if (state === "declined" || state === "cancelled") {
    return <p className="t-body text-fault">This booking is closed.</p>;
  }

  if (state === "disputed") {
    return (
      <p className="t-body text-fault">
        Disputed. Showzy support is reviewing — funds stay in escrow until it's resolved.
      </p>
    );
  }

  if (!canAct) {
    return (
      <Button disabled>
        {viewerIsHost ? "Waiting for reply" : "Waiting for the host"}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-stretch gap-2">
        <span className="t-mono grid w-11 place-items-center border border-line bg-ink text-[15px] text-muted">
          ₹
        </span>
        <Input
          aria-label="Counter offer amount"
          inputMode="numeric"
          placeholder="Counter with"
          value={counter}
          disabled={countersLeft === 0}
          onChange={(e) => setCounter(e.target.value.replace(/\D/g, ""))}
          className="t-mono w-[132px]"
        />
        <Button onClick={onCounter} disabled={countersLeft === 0 || !counter}>
          Counter
        </Button>
      </div>
      <Button variant="primary" onClick={onAccept}>
        Accept {money(standing)}
      </Button>
      <Button variant="destructive" onClick={onDecline}>
        Decline
      </Button>
    </div>
  );
}
