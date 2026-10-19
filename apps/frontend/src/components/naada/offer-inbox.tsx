import { useCallback, useState, type ReactNode } from "react";
import { Pill } from "@/components/ui/pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { actionError } from "@/components/naada/api-message";
import { useStore } from "@/store/app-store";
import {
  acceptOffer,
  getMyConversations,
  makeOffer,
  rejectOffer,
  type ApiConversation,
  type ApiOffer,
} from "@/lib/api";
import { useAsync } from "@/screens/home/home-kit";
import { dateListingFull, money } from "@/lib/format";

type Waiting = ApiConversation & { pending_offer: ApiOffer };

/** Offers lapse 48 hours after they land; say how long is left. */
function expiryNote(offer: ApiOffer): string {
  if (!offer.expires_at) return "";
  const hours = Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 3_600_000);
  if (hours <= 0) return "Expires soon";
  if (hours < 24) return `Expires in ${hours}h`;
  return `Expires in ${Math.round(hours / 24)}d`;
}

/**
 * Every offer waiting on someone, read from the server — so an offer a host
 * sent, or an artist's counter, is here whichever browser it was made in.
 *
 * Whoever did not propose the standing offer can accept, counter or decline it;
 * whoever did can withdraw it. `empty` is what to show when nothing is waiting
 * (omit it to render nothing at all).
 */
export function OfferInbox({
  viewer,
  empty = null,
  onLoaded,
  className = "",
}: {
  viewer: "artist" | "host";
  empty?: ReactNode;
  /** Called with how many offers are waiting for *this* person to answer. */
  onLoaded?: (awaitingMe: number) => void;
  className?: string;
}) {
  const { currentUser, toast, hydrateFromApi } = useStore();

  const fetchInbox = useCallback(async () => {
    const data = await getMyConversations();
    const waiting = data.results.filter((c): c is Waiting => Boolean(c.pending_offer));
    onLoaded?.(waiting.filter((c) => c.pending_offer.proposed_by !== currentUser?.id).length);
    return waiting;
  }, [currentUser?.id, onLoaded]);
  const inbox = useAsync(fetchInbox, "load your offers");

  const [busyId, setBusyId] = useState<string | null>(null);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterFee, setCounterFee] = useState("");
  const [error, setError] = useState("");

  const other = (c: Waiting) => (viewer === "artist" ? c.organizer_name : c.artist_name);

  const run = async (
    convoId: string,
    action: string,
    fn: () => Promise<unknown>,
    done: string,
    refreshBookings = false,
  ) => {
    setBusyId(convoId);
    setError("");
    try {
      await fn();
      toast(done, "success");
      setCounterFor(null);
      inbox.reload();
      // An accepted offer becomes a booking; pull it into the bookings list.
      if (refreshBookings) void hydrateFromApi();
    } catch (err) {
      setError(actionError(err, action));
    } finally {
      setBusyId(null);
    }
  };

  const sendCounter = (convo: Waiting) => {
    const fee = Number(counterFee.replace(/[^\d]/g, ""));
    if (!fee) return;
    const offer = convo.pending_offer;
    void run(
      convo.id,
      "send your counter",
      () =>
        makeOffer(convo.id, {
          fee_amount: String(fee),
          performance_date: offer.performance_date,
          performance_duration_minutes: offer.performance_duration_minutes,
          set_count: offer.set_count,
          counter_of: offer.id,
        }),
      `Counter sent to ${other(convo)}`,
    );
  };

  const waiting = inbox.data ?? [];

  return (
    <div className={className}>
      {error && (
        <p className="t-small mb-4 border border-fault bg-surface px-4 py-3 text-fault" role="alert">
          {error}
        </p>
      )}

      {inbox.loading && !inbox.data ? (
        // A page that only shows this when there's something waiting has no
        // business flashing a loading box at everyone else.
        empty === null ? null : (
          <p className="t-body border border-dashed border-line px-4 py-12 text-center text-muted">
            Loading your offers…
          </p>
        )
      ) : inbox.error ? (
        <div className="border border-fault bg-surface p-5">
          <p className="t-body">{inbox.error}</p>
          <Button variant="primary" className="mt-4" onClick={inbox.reload}>
            Try again
          </Button>
        </div>
      ) : waiting.length === 0 ? (
        empty
      ) : (
        <ul className="divide-y divide-[var(--glass-border-soft)] glass-soft overflow-hidden rounded-xl">
          {waiting.map((convo) => {
            const offer = convo.pending_offer;
            const mine = offer.proposed_by === currentUser?.id;
            const busy = busyId === convo.id;
            return (
              <li key={convo.id} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px]">{convo.event_title || "Event offer"}</p>
                    <p className="t-small mt-0.5 text-muted">
                      {other(convo)} · {dateListingFull(offer.performance_date)}
                    </p>
                    <p className="t-small mt-0.5 text-muted">
                      {offer.set_count} {offer.set_count === 1 ? "set" : "sets"} ·{" "}
                      {offer.performance_duration_minutes} min
                    </p>
                    <p className="tabular-nums font-semibold mt-2 text-[19px]">
                      {money(Number(offer.fee_amount))}
                      {mine && <span className="t-small ml-2 text-muted">(your offer)</span>}
                    </p>
                    {offer.notes && (
                      <p className="t-small mt-2 max-w-[56ch] text-muted">“{offer.notes}”</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Pill>{mine ? `Waiting on ${viewer === "artist" ? "host" : "artist"}` : "New offer"}</Pill>
                    <span className="t-small text-muted">{expiryNote(offer)}</span>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {mine ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void run(convo.id, "withdraw your offer", () => rejectOffer(offer.id), "Offer withdrawn")
                      }
                    >
                      Withdraw
                    </Button>
                  ) : counterFor === convo.id ? (
                    <>
                      <span className="t-mono grid h-9 w-9 place-items-center border border-line bg-ink text-muted">
                        ₹
                      </span>
                      <Input
                        aria-label="Your counter fee"
                        inputMode="numeric"
                        autoFocus
                        className="tabular-nums font-semibold w-[120px]"
                        value={counterFee}
                        onChange={(e) => setCounterFee(e.target.value.replace(/[^\d]/g, ""))}
                      />
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy || !Number(counterFee)}
                        onClick={() => sendCounter(convo)}
                      >
                        {busy ? "Sending…" : "Send counter"}
                      </Button>
                      <Button size="sm" disabled={busy} onClick={() => setCounterFor(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            convo.id,
                            "accept this offer",
                            () => acceptOffer(offer.id),
                            "Offer accepted",
                            true,
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setCounterFor(convo.id);
                          setCounterFee(String(Math.round(Number(offer.fee_amount))));
                        }}
                      >
                        Counter
                      </Button>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void run(convo.id, "decline this offer", () => rejectOffer(offer.id), "Offer declined")
                        }
                      >
                        Decline
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
