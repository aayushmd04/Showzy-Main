import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { ConsoleShell, ARTIST_NAV, HOST_NAV } from "@/components/naada/console-shell";
import { StateToggle } from "@/components/naada/state-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill, statusLabel } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { MAX_COUNTERS, PLATFORM_FEE_RATE, type BookingState } from "@/data/fixtures";
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
  const navigate = useNavigate();
  const {
    bookingById,
    eventById,
    artistById,
    venueOf,
    role,
    users,
    counterBooking,
    acceptBooking,
    declineBooking,
    fundBooking,
    setBookingState,
    countersUsed,
    toast,
  } = useStore();
  const [counter, setCounter] = useState("");
  const [fundOpen, setFundOpen] = useState(false);
  const reduce = useReducedMotion();

  const booking = bookingById(id);
  if (!booking) return <NotFoundScreen />;

  const event = eventById(booking.eventId);
  const artist = artistById(booking.artistId);
  const venue = event ? venueOf(event) : undefined;
  const viewerIsHost = role !== "artist";
  const viewer: "host" | "artist" = viewerIsHost ? "host" : "artist";

  const used = countersUsed(booking);
  const countersLeft = Math.max(0, MAX_COUNTERS - used);
  const lastQuote = booking.quotes[booking.quotes.length - 1];
  const standing = booking.agreedFee ?? lastQuote?.amount ?? 0;
  const platformFee = Math.round(standing * PLATFORM_FEE_RATE);

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
            onClick={() => navigate(viewerIsHost ? "/host/bookings" : "/artist/offers")}
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
        <StateToggle
          value={booking.state}
          options={STATES}
          onChange={(next) => {
            setBookingState(booking.id, next);
            toast(`Booking set to ${next}`);
          }}
        />
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
          const who = fromHost ? users.host.name.split(" ")[0] : artist?.name.split(" ")[0];
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
        {viewerIsHost ? (
          <>
            <div className="flex justify-between gap-4 py-1">
              <dt className="t-small text-muted">
                Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
              </dt>
              <dd className="t-mono text-[15px]">{money(platformFee)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t border-line pt-2">
              <dt className="text-[15px]">You pay</dt>
              <dd className="t-mono text-[17px] font-medium">{money(standing + platformFee)}</dd>
            </div>
          </>
        ) : (
          <div className="flex justify-between gap-4 border-t border-line pt-2">
            <dt className="text-[15px]">You receive</dt>
            <dd className="t-mono text-[17px] font-medium text-live">{money(standing)}</dd>
          </div>
        )}
      </dl>

      {/* Role-conditional action bar */}
      <div className="mt-6 border-t border-line pt-5">
        <ActionBar
          state={booking.state}
          viewerIsHost={viewerIsHost}
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
          Keep it on Naada. Payment is only protected for bookings arranged here.
        </p>
      </div>

      <Modal open={fundOpen} onClose={() => setFundOpen(false)} title="Fund escrow">
        <p className="t-body text-paper/90">
          {money(standing)} goes into escrow now and is released to {artist?.name} 72 hours after
          the gig. You can cancel until the event starts.
        </p>
        <dl className="mt-5 border border-line bg-ink p-4">
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">Artist fee</dt>
            <dd className="t-mono text-[14px]">{money(standing)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">
              Platform fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)
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
        Disputed. Naada support is reviewing — funds stay in escrow until it's resolved.
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
