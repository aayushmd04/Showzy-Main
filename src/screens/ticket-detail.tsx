import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarPlus, Download } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { TicketStub } from "@/components/naada/ticket-stub";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { dateListingFull, money } from "@/lib/format";
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

  if (!ticket || !event) return <NotFoundScreen />;

  const venue = venueOf(event);
  const paid = ticket.price + ticket.fee;

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
          <TicketStub code={ticket.code}>
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

            <p className="t-mono mt-6 break-all text-[17px] tracking-[0.14em] text-paper">
              {ticket.code}
            </p>

            <p className="t-mono mt-5 text-[15px]">
              {ticket.price === 0 ? (
                <span className="text-live">Free entry</span>
              ) : (
                <>
                  Paid <span className="font-medium">{money(paid)}</span>
                </>
              )}
            </p>
            {ticket.status === "cancelled" && (
              <p className="t-small mt-3 text-fault">
                Cancelled. Refunds take 5–7 working days.
              </p>
            )}
          </TicketStub>
        </motion.div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => toast("Added to your calendar")}>
            <CalendarPlus className="size-4" aria-hidden="true" />
            Add to calendar
          </Button>
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
