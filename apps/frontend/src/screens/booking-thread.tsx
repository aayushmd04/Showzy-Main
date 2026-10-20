import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ShieldCheck, Star } from "lucide-react";
import { usePageMeta } from "@/lib/use-meta";
import { ConsoleShell, ADMIN_NAV, ARTIST_NAV, HOST_NAV } from "@/components/naada/console-shell";
import { actionError } from "@/components/naada/api-message";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill, statusLabel } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { useConversationMessages, useMyConversations, useOrderReviews } from "@/hooks/use-api";
import {
  acceptOffer,
  cancelBookingOrder,
  makeOffer,
  rejectOffer,
  reviewBooking,
  sendMessage,
  type ApiConversation,
  type ApiBookingReview,
  type ApiMessage,
  type ApiOffer,
} from "@/lib/api";
import { findThread, offersIn, threadStatus } from "@/lib/thread";
import { PLATFORM_FEE_RATE, TDS_RATE, type Booking } from "@/data/fixtures";
import { dateListingFull, money, quoteStamp } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "./not-found";

/**
 * Section 7.13 — one screen shared by Host and Artist, rendered inside
 * whichever console the viewer is in. It reads and writes the server's
 * conversation, so a message or offer made in one browser is in the other's
 * thread (and survives a reload). `:id` is a conversation id or the id of the
 * booking that conversation produced.
 */
export function BookingThreadScreen() {
  const { id = "" } = useParams();
  usePageMeta({ title: "Booking" });
  const navigate = useNavigate();
  const {
    bookingById,
    role,
    currentUser,
    apiFundOrder,
    hydrateFromApi,
    toast,
  } = useStore();
  const reduce = useReducedMotion();
  const chatEndRef = useRef<HTMLLIElement>(null);

  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fundOpen, setFundOpen] = useState(false);

  const isAdmin = role === "admin";
  const viewerIsHost = role === "host" || isAdmin;
  const me = currentUser?.id;

  const convos = useMyConversations();
  const thread: ApiConversation | undefined = findThread(convos.data?.results ?? [], id);
  const liveMessages = useConversationMessages(thread?.id ?? null);
  const messages: ApiMessage[] = useMemo(() => liveMessages.data?.results ?? [], [liveMessages.data]);
  const offers = useMemo(() => offersIn(messages), [messages]);

  // The booking this thread produced, if an offer in it was accepted. An admin
  // is not in the conversation, so they reach the booking directly.
  const booking: Booking | undefined = bookingById(thread?.order_id ?? id);
  // Ratings open once the gig has happened.
  const reviewable = booking?.state === "performed" || booking?.state === "released";
  const reviews = useOrderReviews(reviewable && !isAdmin ? booking.id : null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView?.({ behavior: "smooth" });
  }, [messages.length]);

  const refresh = async () => {
    await Promise.all([convos.mutate(), liveMessages.mutate()]);
  };

  const run = async (action: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
      if (done) toast(done, "success");
    } catch (err) {
      setError(actionError(err, action));
    } finally {
      setBusy(false);
    }
  };

  if (!thread && !(isAdmin && booking)) {
    if (convos.isLoading || (!convos.data && !convos.error)) {
      return (
        <ShellFor isAdmin={isAdmin} viewerIsHost={viewerIsHost} crumb="Booking">
          <p className="t-body border border-dashed border-line px-4 py-12 text-center text-muted">
            Loading the conversation…
          </p>
        </ShellFor>
      );
    }
    if (convos.error) {
      return (
        <ShellFor isAdmin={isAdmin} viewerIsHost={viewerIsHost} crumb="Booking">
          <div className="border border-fault bg-surface p-5">
            <p className="t-body">{actionError(convos.error, "load this conversation")}</p>
            <Button variant="primary" className="mt-4" onClick={() => void convos.mutate()}>
              Try again
            </Button>
          </div>
        </ShellFor>
      );
    }
    return <NotFoundScreen />;
  }

  const counterpart = thread
    ? viewerIsHost
      ? thread.artist_name
      : thread.organizer_name
    : "";
  const title = thread?.event_title || "Booking";
  const status = thread ? threadStatus(thread, offers, me) : { kind: "booked" as const };
  const pending = thread?.pending_offer ?? null;
  const lastOffer = offers[offers.length - 1];
  const standingOffer = pending ?? lastOffer;

  const standing = booking?.agreedFee ?? (standingOffer ? Number(standingOffer.fee_amount) : 0);
  const platformFee = Math.round(standing * PLATFORM_FEE_RATE);
  // TDS is deducted from the artist's side only; the venue never sees it.
  const tds = Math.round(standing * TDS_RATE);


  const banner = (() => {
    switch (status.kind) {
      case "booked":
        return booking ? statusLabel(booking.state) : "BOOKED";
      case "awaiting-you":
        return "Offer waiting for your answer";
      case "awaiting-them":
        return `Waiting on ${counterpart}`;
      case "closed":
        return `Last offer ${status.offer.status}`;
      default:
        return "No offer yet";
    }
  })();

  const submitChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatDraft.trim();
    if (!thread || !text || sending) return;
    setSending(true);
    setError("");
    try {
      const sent = await sendMessage(thread.id, text);
      setChatDraft("");
      await refresh();
      if (sent.is_flagged) toast("Message sent — flagged for review", "fault");
    } catch (err) {
      setError(actionError(err, "send your message"));
    } finally {
      setSending(false);
    }
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
            {title}
            {counterpart && ` · ${counterpart}`}
          </h1>
          {booking && (
            <p className="t-body mt-2 text-muted">
              {dateListingFull(
                (booking as Booking & { _performanceDate?: string })._performanceDate ?? "",
              )}
            </p>
          )}
        </div>
      </div>

      {/* Status banner */}
      <div
        className={cn(
          "mt-6 flex flex-wrap items-center justify-between gap-3 border px-4 py-3",
          booking?.state === "released" || booking?.state === "funded"
            ? "border-brass"
            : booking?.state === "cancelled" || booking?.state === "disputed" || status.kind === "closed"
              ? "border-fault"
              : "border-line",
        )}
      >
        <p className="t-mono text-[12px] uppercase tracking-[0.08em]">{banner}</p>
        {booking && <Pill>{statusLabel(booking.state)}</Pill>}
      </div>

      {error && (
        <p className="t-small mt-4 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
          {error}
        </p>
      )}

      {/* Fee breakdown — the commercial promise, on both sides of the table */}
      {standingOffer || booking ? (
        <dl className="mt-6 border border-line bg-surface p-4">
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">{booking ? "Agreed fee" : "Standing offer"}</dt>
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
              <dt className="t-small text-muted">
                TDS ({Math.round(TDS_RATE * 100)}%, deducted from the artist)
              </dt>
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
      ) : null}

      {booking && (booking.state === "disputed" || booking.resolution) && (
        <div className="mt-6 border border-fault bg-surface p-4">
          <p className="t-h3 text-fault">
            {booking.resolution ? "Dispute resolved" : "Dispute open"}
          </p>
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

      {/* The conversation: messages and offers in the order they happened. */}
      {thread && (
        <section className="mt-6 border-t border-line pt-5">
          <h2 className="t-micro">Conversation</h2>
          <ol className="mt-3 max-h-[480px] space-y-3 overflow-y-auto" aria-label="Messages">
            {messages.length === 0 && (
              <li className="t-small border border-dashed border-line px-4 py-6 text-center text-muted">
                {liveMessages.isLoading ? "Loading messages…" : "No messages yet."}
              </li>
            )}
            {messages.map((m, i) => {
              const mine = m.sender === me;
              return (
                <motion.li
                  key={m.id}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.2, delay: reduce ? 0 : Math.min(i, 8) * 0.03 }}
                  className={cn("flex", mine ? "justify-end" : "justify-start")}
                >
                  {m.message_type === "offer" && m.offer ? (
                    <OfferCard offer={m.offer} mine={mine} who={mine ? "You" : m.sender_name || counterpart} at={m.created_at} />
                  ) : (
                    <div
                      className={cn(
                        "w-[min(320px,85%)] border bg-surface p-3",
                        m.is_flagged ? "border-brass" : "border-line",
                        m.message_type === "system" && "mx-auto text-center",
                      )}
                    >
                      {!mine && m.message_type !== "system" && (
                        <p className="t-micro mb-1">{m.sender_name || counterpart}</p>
                      )}
                      <p className="t-small whitespace-pre-wrap break-words text-paper/90">{m.content}</p>
                      <p className="t-mono mt-1 text-[11px] text-muted">{quoteStamp(m.created_at)}</p>
                      {m.is_flagged && (
                        <p className="t-small mt-1.5 flex items-center gap-1.5 text-brass">
                          <ShieldCheck className="size-3.5 shrink-0" aria-hidden="true" />
                          Flagged — {m.flag_reason || "contact details"}
                        </p>
                      )}
                    </div>
                  )}
                </motion.li>
              );
            })}
            <li ref={chatEndRef} aria-hidden="true" />
          </ol>

          {!isAdmin && (
            <form className="mt-3 flex gap-2" onSubmit={submitChat}>
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
      )}

      {/* Role-conditional action bar */}
      <div className="mt-6 border-t border-line pt-5">
        {isAdmin ? (
          <p className="t-body text-muted">
            {booking?.resolution
              ? `Resolved — ${booking.resolution.outcome === "release" ? "released to artist" : "refunded to host"}.`
              : "Read-only. Resolve this booking from the disputes queue."}
          </p>
        ) : booking ? (
          <BookingActions
            state={booking.state}
            viewerIsHost={viewerIsHost}
            standing={standing}
            busy={busy}
            onFund={() => setFundOpen(true)}
            onCancel={() =>
              void run(
                "cancel this booking",
                async () => {
                  await cancelBookingOrder(booking.id);
                  await hydrateFromApi();
                },
                "Booking cancelled",
              )
            }
          />
        ) : thread && pending ? (
          <OfferActions
            offer={pending}
            mine={pending.proposed_by === me}
            busy={busy}
            counterpart={counterpart}
            onAccept={() =>
              void run(
                "accept this offer",
                async () => {
                  await acceptOffer(pending.id);
                  await hydrateFromApi();
                },
                `Accepted ${money(Number(pending.fee_amount))}`,
              )
            }
            onDecline={() => void run("decline this offer", () => rejectOffer(pending.id), "Offer declined")}
            onWithdraw={() => void run("withdraw your offer", () => rejectOffer(pending.id), "Offer withdrawn")}
            onCounter={(fee) =>
              void run(
                "send your counter",
                () =>
                  makeOffer(thread.id, {
                    fee_amount: String(fee),
                    performance_date: pending.performance_date,
                    performance_duration_minutes: pending.performance_duration_minutes,
                    set_count: pending.set_count,
                    counter_of: pending.id,
                  }),
                `Countered with ${money(fee)}`,
              )
            }
          />
        ) : thread ? (
          <NewOfferForm
            busy={busy}
            seed={lastOffer}
            onSend={(fee, date) =>
              void run(
                "send your offer",
                () =>
                  makeOffer(thread.id, {
                    fee_amount: String(fee),
                    performance_date: date,
                    performance_duration_minutes: lastOffer?.performance_duration_minutes ?? 90,
                    set_count: lastOffer?.set_count ?? 2,
                  }),
                "Offer sent",
              )
            }
          />
        ) : null}

        <p className="t-small mt-4 flex items-center gap-2 text-muted">
          <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
          Keep it on Showzy. Payment is only protected for bookings arranged here.
        </p>
      </div>

      {!isAdmin && booking && reviewable && reviews.data && (
        <ReviewSection
          reviews={reviews.data.results}
          myDirection={reviews.data.my_direction}
          viewerIsHost={viewerIsHost}
          counterpart={counterpart}
          onSubmit={async (rating, text) => {
            await reviewBooking(booking.id, { rating, body: text });
            await reviews.mutate();
            toast("Review submitted", "success");
          }}
        />
      )}

      <Modal open={fundOpen} onClose={() => setFundOpen(false)} title="Fund escrow">
        <p className="t-body text-paper/90">
          {money(standing + platformFee)} goes into escrow now. {thread?.artist_name} receives{" "}
          {money(standing - tds)} (their fee less {Math.round(TDS_RATE * 100)}% TDS) 72 hours after the
          gig; Showzy keeps its {money(platformFee)} fee. You can cancel until the event starts.
        </p>
        <dl className="mt-5 border border-line bg-ink p-4">
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">Artist's agreed fee</dt>
            <dd className="t-mono text-[14px]">{money(standing)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-1">
            <dt className="t-small text-muted">Showzy fee ({Math.round(PLATFORM_FEE_RATE * 100)}%)</dt>
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
          disabled={busy}
          onClick={() => {
            if (!booking) return;
            setFundOpen(false);
            void run("fund escrow", () => apiFundOrder(booking.id), "Escrow funded");
          }}
        >
          Fund {money(standing + platformFee)}
        </Button>
      </Modal>
    </>
  );

  return (
    <ShellFor
      isAdmin={isAdmin}
      viewerIsHost={viewerIsHost}
      crumb={counterpart || "Booking"}
      eventName={thread?.event_title}
    >
      {body}
    </ShellFor>
  );
}

function ShellFor({
  isAdmin,
  viewerIsHost,
  crumb,
  eventName,
  children,
}: {
  isAdmin: boolean;
  viewerIsHost: boolean;
  crumb: string;
  eventName?: string | null;
  children: ReactNode;
}) {
  if (isAdmin) {
    return (
      <ConsoleShell nav={ADMIN_NAV} breadcrumb={["Disputes", crumb]}>
        {children}
      </ConsoleShell>
    );
  }
  return viewerIsHost ? (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Bookings", crumb]}>
      {children}
    </ConsoleShell>
  ) : (
    <ConsoleShell nav={ARTIST_NAV} breadcrumb={["Offers", eventName || crumb]}>
      {children}
    </ConsoleShell>
  );
}

/** An offer, drawn where it happened in the thread, with where it stands now. */
function OfferCard({
  offer,
  mine,
  who,
  at,
}: {
  offer: ApiOffer;
  mine: boolean;
  who: string;
  at: string;
}) {
  return (
    <div
      className={cn(
        "w-[min(300px,85%)] border bg-surface p-4",
        offer.status === "accepted" ? "border-live" : "border-line",
        mine && "ml-auto",
      )}
      data-testid="offer-card"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="t-micro">
          {who} {offer.counter_of_id ? "countered" : "offered"}
        </p>
        <Pill>{statusLabel(offer.status)}</Pill>
      </div>
      <p className="t-mono mt-1.5 text-[24px] font-medium">{money(Number(offer.fee_amount))}</p>
      <p className="t-small mt-1 text-muted">
        {dateListingFull(offer.performance_date)} · {offer.set_count}{" "}
        {offer.set_count === 1 ? "set" : "sets"} · {offer.performance_duration_minutes} min
      </p>
      {offer.notes && <p className="t-small mt-2 text-muted">“{offer.notes}”</p>}
      <p className="t-mono mt-1 text-[12px] text-muted">{quoteStamp(at)}</p>
    </div>
  );
}

/** Whoever did not make the standing offer can answer it; whoever did can withdraw it. */
function OfferActions({
  offer,
  mine,
  busy,
  counterpart,
  onAccept,
  onDecline,
  onWithdraw,
  onCounter,
}: {
  offer: ApiOffer;
  mine: boolean;
  busy: boolean;
  counterpart: string;
  onAccept: () => void;
  onDecline: () => void;
  onWithdraw: () => void;
  onCounter: (fee: number) => void;
}) {
  const [counter, setCounter] = useState("");
  const fee = Number(counter.replace(/\D/g, ""));

  if (mine) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy} onClick={onWithdraw}>
          Withdraw offer
        </Button>
        <p className="t-small text-muted">Waiting for {counterpart} to reply.</p>
      </div>
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
          onChange={(e) => setCounter(e.target.value.replace(/\D/g, ""))}
          className="t-mono w-[132px]"
        />
        <Button
          disabled={busy || !fee}
          onClick={() => {
            onCounter(fee);
            setCounter("");
          }}
        >
          Counter
        </Button>
      </div>
      <Button variant="primary" disabled={busy} onClick={onAccept}>
        Accept {money(Number(offer.fee_amount))}
      </Button>
      <Button variant="destructive" disabled={busy} onClick={onDecline}>
        Decline
      </Button>
    </div>
  );
}

/** Nothing is on the table (no offer yet, or the last one was turned down): either side can make one. */
function NewOfferForm({
  busy,
  seed,
  onSend,
}: {
  busy: boolean;
  seed?: ApiOffer;
  onSend: (fee: number, date: string) => void;
}) {
  const [fee, setFee] = useState(seed ? String(Math.round(Number(seed.fee_amount))) : "");
  const [date, setDate] = useState(seed?.performance_date ?? "");
  const amount = Number(fee.replace(/\D/g, ""));

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (amount && date) onSend(amount, date);
      }}
    >
      <div className="flex items-stretch gap-2">
        <span className="t-mono grid w-11 place-items-center border border-line bg-ink text-[15px] text-muted">
          ₹
        </span>
        <Input
          aria-label="Offer amount"
          inputMode="numeric"
          placeholder="Offer"
          value={fee}
          onChange={(e) => setFee(e.target.value.replace(/\D/g, ""))}
          className="t-mono w-[132px]"
        />
      </div>
      <Input
        aria-label="Performance date"
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="w-[170px]"
      />
      <Button type="submit" variant="primary" disabled={busy || !amount || !date}>
        Make an offer
      </Button>
    </form>
  );
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn("size-4", n <= rating ? "fill-brass text-brass" : "text-line")}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

/** Each side rates the other once; both ratings are shown here, read from the server. */
function ReviewSection({
  reviews,
  myDirection,
  viewerIsHost,
  counterpart,
  onSubmit,
}: {
  reviews: ApiBookingReview[];
  myDirection: ApiBookingReview["direction"];
  viewerIsHost: boolean;
  counterpart: string;
  onSubmit: (rating: number, body: string) => Promise<void>;
}) {
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const mine = reviews.find((r) => r.direction === myDirection);
  const theirs = reviews.find((r) => r.direction !== myDirection);

  const submit = async () => {
    setSaving(true);
    setError("");
    try {
      await onSubmit(rating, text.trim());
    } catch (err) {
      setError(actionError(err, "submit your review"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-6 border-t border-line pt-5">
      <h2 className="t-micro">{viewerIsHost ? `Rate ${counterpart}` : "Rate the host"}</h2>
      {mine ? (
        <div className="mt-3 border border-line bg-surface p-4">
          <p className="t-micro mb-1">Your review</p>
          <Stars rating={mine.rating} label={`${mine.rating} out of 5 stars`} />
          {mine.body && <p className="t-small mt-2 text-paper/90">{mine.body}</p>}
        </div>
      ) : (
        <div className="mt-3 border border-line bg-surface p-4">
          <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating out of 5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} star${n === 1 ? "" : "s"}`}
                onClick={() => setRating(n)}
                className="grid size-9 place-items-center"
              >
                <Star
                  className={cn("size-5", n <= rating ? "fill-brass text-brass" : "text-line")}
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
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {error && (
            <p className="t-small mt-2 text-fault" role="alert">
              {error}
            </p>
          )}
          <Button size="sm" variant="primary" className="mt-2" disabled={saving} onClick={() => void submit()}>
            {saving ? "Submitting…" : "Submit review"}
          </Button>
        </div>
      )}
      {theirs && (
        <div className="mt-3 border border-line bg-surface p-4">
          <p className="t-micro mb-1">{viewerIsHost ? `${counterpart} reviewed you` : "The host reviewed you"}</p>
          <Stars rating={theirs.rating} label={`${theirs.rating} out of 5 stars from them`} />
          {theirs.body && <p className="t-small mt-2 text-paper/90">{theirs.body}</p>}
        </div>
      )}
    </section>
  );
}

/** What the booking itself still needs from this person, once the terms are agreed. */
function BookingActions({
  state,
  viewerIsHost,
  standing,
  busy,
  onFund,
  onCancel,
}: {
  state: Booking["state"];
  viewerIsHost: boolean;
  standing: number;
  busy: boolean;
  onFund: () => void;
  onCancel: () => void;
}) {
  if (state === "accepted") {
    return viewerIsHost ? (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={busy} onClick={onFund}>
          Fund escrow
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onCancel}>
          Cancel booking
        </Button>
      </div>
    ) : (
      <p className="t-body text-muted">Waiting for the host to fund escrow.</p>
    );
  }
  if (state === "funded") {
    return viewerIsHost ? (
      <p className="t-body text-live">Escrow funded — it goes to the artist after the gig.</p>
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
  return null;
}
