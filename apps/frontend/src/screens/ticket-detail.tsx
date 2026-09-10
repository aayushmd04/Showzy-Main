import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarPlus, Download } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { TicketStub } from "@/components/naada/ticket-stub";
import { ReviewForm } from "@/components/naada/review-form";
import { buildIcs, downloadIcs } from "@/components/naada/calendar-ics";
import {
  eventHasHappened,
  loadEventDetail,
  type EventDetail,
} from "@/components/naada/event-data";
import { actionError } from "@/components/naada/api-message";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { dateListingFull, money } from "@/lib/format";
import { CONVENIENCE_FEE } from "@/data/fixtures";
import { usePageMeta } from "@/lib/use-meta";
import { NotFoundScreen } from "./not-found";

/** Section 7.7 — the signature screen. */
export function TicketDetailScreen() {
  const { code = "" } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const { ticketByCode, eventById, venueOf, cancelTicket, toast, clearCheckout } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reduce = useReducedMotion();

  const ticket = ticketByCode(code);
  const event = ticket ? eventById(ticket.eventId) : undefined;

  /*
   * The calendar file needs a real end time, the venue's area and the event's
   * own description — none of which the tickets endpoint carries. So fetch the
   * event itself rather than inventing a duration.
   */
  const eventId = ticket?.eventId ?? "";
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!eventId) return;
    setDetail(null);
    setDetailError("");
    loadEventDetail(eventId)
      .then((data) => {
        if (alive) setDetail(data);
      })
      .catch((err) => {
        if (alive) setDetailError(actionError(err, "load this event's details"));
      });
    return () => {
      alive = false;
    };
  }, [eventId]);

  usePageMeta({
    title: ticket ? `Ticket ${ticket.code}` : "Ticket",
    description: event ? `Your ticket for ${event.name}.` : undefined,
  });

  if (!ticket || !event) return <NotFoundScreen />;

  const venue = venueOf(event);

  /*
   * The tickets endpoint carries no price, so a server-issued ticket arrives
   * with zero. Reading that literally made every paid ticket announce "Free
   * entry". Take the amount from the event's own tier instead, and say nothing
   * about price when the tier can't be found rather than guessing.
   */
  const tierOnEvent = event.tiers.find((t) => t.name === ticket.tier);
  const tierPrice = tierOnEvent?.price ?? (ticket.price || null);
  // Paid tickets carry the same per-ticket booking fee the order charged.
  const bookingFee = tierPrice ? CONVENIENCE_FEE : 0;
  const paid = tierPrice === null ? null : tierPrice + bookingFee;

  const isPast = eventHasHappened(detail?.start_datetime);
  const canReview = isPast && ticket.status !== "cancelled";

  const addToCalendar = () => {
    if (!detail) {
      toast(
        detailError ||
          "Still loading this event's times — give it a second and tap again.",
        detailError ? "fault" : "default",
      );
      return;
    }
    const place = [detail.venue?.name, detail.venue?.area_name, detail.venue?.city_name]
      .filter(Boolean)
      .join(", ");

    const ics = buildIcs({
      // Per ticket, so a re-download replaces the entry instead of doubling it.
      uid: `ticket-${ticket.id}@naada`,
      title: detail.title,
      start: detail.start_datetime,
      end: detail.end_datetime,
      location: place,
      description: [
        `${ticket.tier} · ${ticket.holder}`,
        ticket.seat ? `Seated at ${ticket.seat}.` : "",
        `Ticket ${ticket.code} — show the QR at the door.`,
        detail.doors_open_at
          ? `Doors ${new Date(detail.doors_open_at).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })}.`
          : "",
        `${window.location.origin}/ticket/${ticket.code}`,
      ]
        .filter(Boolean)
        .join("\n"),
      url: `${window.location.origin}/e/${detail.id}`,
    });

    const ok = downloadIcs(`naada-${ticket.code}.ics`, ics);
    toast(
      ok
        ? "Calendar file downloaded — open it to add the gig"
        : "Your browser blocked the download. Allow downloads for this site and try again.",
      ok ? "default" : "fault",
    );
  };

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[720px] px-4 py-8 md:py-12">
        {isNew && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 border border-live px-4 py-3"
          >
            <p className="t-h3 text-live">You're in.</p>
            <p className="t-small mt-1 text-paper/90">
              We've sent the ticket to your phone. Show the QR at the door.
            </p>
          </motion.div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="t-micro">Your ticket</h1>
          <Pill>{ticket.status === "checked_in" ? "Checked in" : ticket.status}</Pill>
        </div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          <TicketStub
            code={ticket.code}
            qrImageUrl={(ticket as { _qrImageUrl?: string })._qrImageUrl}
          >
            <p className="t-display break-words text-[clamp(24px,5vw,34px)]">{event.name}</p>
            <p className="t-body mt-2 text-muted">
              {venue?.name} · {venue?.area}
            </p>

            <p className="t-mono mt-6 text-[15px] uppercase tracking-[0.06em]">
              {dateListingFull(event.date)} · {event.time}
            </p>
            <p className="t-small mt-1 text-muted">
              {ticket.tier} × 1 · {ticket.holder}
            </p>
            {/* Where in the room, when the buyer claimed a spot on the venue's
                floor plan. Door staff read this off the ticket. */}
            {ticket.seat && (
              <p className="t-mono mt-2 text-[14px] uppercase tracking-[0.06em] text-paper">
                Seated · {ticket.seat}
              </p>
            )}

            <p className="t-mono mt-6 break-all text-[17px] tracking-[0.14em] text-paper">
              {ticket.code}
            </p>

            {paid !== null && (
              <p className="t-mono mt-5 text-[15px]">
                {paid === 0 ? (
                  <span className="text-live">Free entry</span>
                ) : (
                  <>
                    Paid <span className="font-medium">{money(paid)}</span>
                  </>
                )}
              </p>
            )}
            {ticket.status === "cancelled" && (
              <p className="t-small mt-3 text-fault">
                Cancelled. Refunds take 5–7 working days.
              </p>
            )}
          </TicketStub>
        </motion.div>

        <div className="mt-5 flex flex-wrap gap-2">
          {!isPast && (
            <Button onClick={addToCalendar} disabled={!detail && !detailError}>
              <CalendarPlus className="size-4" aria-hidden="true" />
              Add to calendar
            </Button>
          )}
          <Button onClick={() => toast("Downloads aren't in this prototype")}>
            <Download className="size-4" aria-hidden="true" />
            Download
          </Button>
          {ticket.status === "valid" && (
            <Button variant="destructive" onClick={() => setConfirmOpen(true)}>
              Cancel
            </Button>
          )}
          <Link
            to="/tickets"
            className="btn btn-secondary ml-auto"
            onClick={() => clearCheckout()}
          >
            My tickets
          </Link>
        </div>

        {detailError && !isPast && (
          <p className="t-small mt-3 text-fault" role="alert">
            {detailError}
          </p>
        )}

        {/* The night is over and this person held a ticket for it — the one
            moment they are most likely to say something. */}
        {canReview && detail && (
          <section className="mt-10 border-t border-line pt-6">
            <h2 className="t-micro">You were there</h2>
            <p className="t-body mt-2 max-w-[52ch] text-muted">
              Rate {detail.title}. Your ticket marks the review as coming from
              someone who actually turned up.
            </p>
            <ReviewForm
              className="mt-4"
              eventId={detail.id}
              existing={detail.reviews?.find((r) => r.is_mine) ?? null}
            />
            <Link
              to={`/e/${detail.id}`}
              className="t-small mt-3 inline-flex min-h-11 items-center text-muted underline underline-offset-4 transition-colors hover:text-signal"
            >
              Read what everyone else said
            </Link>
          </section>
        )}

        <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Cancel this ticket?">
          <p className="t-body text-paper/90">
            Refunds take 5–7 working days. Cancelling within 24 hours of the event forfeits the
            ticket price.
          </p>
          <div className="mt-6 flex gap-2">
            <Button full onClick={() => setConfirmOpen(false)}>
              Keep my ticket
            </Button>
            <Button
              variant="destructive"
              full
              onClick={() => {
                cancelTicket(ticket.code);
                setConfirmOpen(false);
                toast("Ticket cancelled", "fault");
              }}
            >
              Cancel ticket
            </Button>
          </div>
        </Modal>
      </div>
    </PublicShell>
  );
}
