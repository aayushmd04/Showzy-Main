import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { CalendarPlus, Download, FileText, Send } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Pill } from "@/components/ui/pill";
import { useStore } from "@/store/app-store";
import { dateListingFull, money } from "@/lib/format";
import { CONVENIENCE_FEE } from "@/data/fixtures";
import * as api from "@/lib/api";
import { usePageMeta } from "@/lib/use-meta";
import { NotFoundScreen } from "./not-found";

/** Extension fields `adaptTicket` bolts on that the shared `Ticket` type
 * doesn't carry — same pattern the existing `_qrImageUrl` read already used. */
type TicketExtras = {
  _qrImageUrl?: string;
  _orderId?: string;
  _tierPrice?: number;
  _transferCount?: number;
};

/** Section 7.7 — the signature screen. */
export function TicketDetailScreen() {
  const { code = "" } = useParams();
  const [params] = useSearchParams();
  const isNew = params.get("new") === "1";
  const navigate = useNavigate();
  const { ticketByCode, eventById, venueOf, hydrateFromApi, toast, clearCheckout } = useStore();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const [transferOpen, setTransferOpen] = useState(false);
  const [transferEmail, setTransferEmail] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState("");

  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoice, setInvoice] = useState<api.ApiInvoice | null>(null);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState("");

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

  const extras = ticket as unknown as TicketExtras;
  const venue = venueOf(event);

  /*
   * The tickets endpoint carries no price, so a server-issued ticket arrives
   * with zero. Reading that literally made every paid ticket announce "Free
   * entry". Take the amount from the event's own tier instead, and say nothing
   * about price when the tier can't be found rather than guessing.
   */
  const tierOnEvent = event.tiers.find((t) => t.name === ticket.tier);
  const tierPrice = tierOnEvent?.price ?? extras._tierPrice ?? (ticket.price || null);
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

  const downloadQr = async () => {
    const url = extras._qrImageUrl;
    if (!url) {
      toast("This ticket's QR code isn't ready yet — try again in a moment.", "fault");
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `naada-${ticket.code}-qr.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      toast("QR code downloaded");
    } catch {
      // Cross-origin media without CORS headers can't be fetched as a blob —
      // opening it directly still lets the buyer save the image themselves.
      window.open(url, "_blank", "noopener,noreferrer");
      toast("Opened your QR code in a new tab — save it from there");
    }
  };

  const doCancel = async () => {
    setCancelling(true);
    setCancelError("");
    try {
      await api.cancelTicketApi(ticket.id);
      await hydrateFromApi();
      setConfirmOpen(false);
      toast("Ticket cancelled", "fault");
    } catch (err) {
      setCancelError(actionError(err, "cancel this ticket"));
    } finally {
      setCancelling(false);
    }
  };

  const doTransfer = async () => {
    if (!transferEmail.trim()) return;
    setTransferring(true);
    setTransferError("");
    try {
      await api.transferTicketApi(ticket.id, transferEmail.trim());
      await hydrateFromApi();
      toast("Ticket transferred");
      navigate("/tickets", { replace: true });
    } catch (err) {
      setTransferError(actionError(err, "transfer this ticket"));
    } finally {
      setTransferring(false);
    }
  };

  const openInvoice = async () => {
    const orderId = extras._orderId;
    if (!orderId) {
      toast("Couldn't find the order for this ticket", "fault");
      return;
    }
    setInvoiceOpen(true);
    setInvoice(null);
    setInvoiceError("");
    setInvoiceLoading(true);
    try {
      const data = await api.getOrderInvoice(orderId);
      setInvoice(data);
    } catch (err) {
      setInvoiceError(actionError(err, "load the invoice"));
    } finally {
      setInvoiceLoading(false);
    }
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
          <TicketStub code={ticket.code} qrImageUrl={extras._qrImageUrl}>
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
            {!!extras._transferCount && (
              <p className="t-small mt-2 text-muted">
                Transferred {extras._transferCount === 1 ? "once" : `${extras._transferCount} times`}.
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
          <Button onClick={downloadQr}>
            <Download className="size-4" aria-hidden="true" />
            Download
          </Button>
          {extras._orderId && (
            <Button onClick={openInvoice}>
              <FileText className="size-4" aria-hidden="true" />
              Tax invoice
            </Button>
          )}
          {ticket.status === "valid" && (
            <Button
              onClick={() => {
                setTransferError("");
                setTransferEmail("");
                setTransferOpen(true);
              }}
            >
              <Send className="size-4" aria-hidden="true" />
              Transfer
            </Button>
          )}
          {ticket.status === "valid" && (
            <Button
              variant="destructive"
              onClick={() => {
                setCancelError("");
                setConfirmOpen(true);
              }}
            >
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
            {paid !== null && paid > 0
              ? `You'll get ${money(tierPrice ?? 0)} back — the booking fee isn't refundable. Refunds take 5–7 working days. Cancelling within 24 hours of the event forfeits the ticket price.`
              : "This ticket is free, so there's nothing to refund — cancelling just gives up your spot."}
          </p>
          {cancelError && (
            <p className="t-small mt-3 text-fault" role="alert">
              {cancelError}
            </p>
          )}
          <div className="mt-6 flex gap-2">
            <Button full disabled={cancelling} onClick={() => setConfirmOpen(false)}>
              Keep my ticket
            </Button>
            <Button variant="destructive" full disabled={cancelling} onClick={doCancel}>
              {cancelling ? "Cancelling…" : "Cancel ticket"}
            </Button>
          </div>
        </Modal>

        <Modal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          title="Transfer this ticket"
        >
          <p className="t-body text-paper/90">
            The recipient needs a Showzy account already — they'll be able to sign in and see this
            ticket under their own "My tickets" the moment you send it.
          </p>
          <label htmlFor="transfer-email" className="t-micro mb-2 mt-5 block">
            Their email address
          </label>
          <Input
            id="transfer-email"
            type="email"
            value={transferEmail}
            onChange={(e) => setTransferEmail(e.target.value)}
            placeholder="friend@example.com"
            autoComplete="off"
          />
          {transferError && (
            <p className="t-small mt-3 text-fault" role="alert">
              {transferError}
            </p>
          )}
          <div className="mt-6 flex gap-2">
            <Button full disabled={transferring} onClick={() => setTransferOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              full
              disabled={transferring || !transferEmail.trim()}
              onClick={doTransfer}
            >
              {transferring ? "Sending…" : "Send ticket"}
            </Button>
          </div>
        </Modal>

        <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)} title="Tax invoice">
          {invoiceLoading && <p className="t-small text-muted">Loading…</p>}
          {invoiceError && (
            <p className="t-small text-fault" role="alert">
              {invoiceError}
            </p>
          )}
          {invoice && (
            <div className="print-invoice">
              <style>{`
                @media print {
                  body * { visibility: hidden; }
                  .print-invoice, .print-invoice * { visibility: visible; }
                  .print-invoice { position: fixed; inset: 0; padding: 24px; }
                }
              `}</style>
              <div className="flex items-baseline justify-between gap-3">
                <p className="t-h3">{invoice.seller.name}</p>
                <p className="t-mono text-[13px] text-muted">{invoice.invoice_number}</p>
              </div>
              {invoice.seller.gstin && (
                <p className="t-small mt-1 text-muted">GSTIN {invoice.seller.gstin}</p>
              )}
              <p className="t-small mt-4 text-muted">
                Billed to {invoice.buyer.name} · {invoice.buyer.email}
              </p>
              <p className="t-small mt-1 text-muted">
                {invoice.event.title} · {dateListingFull(invoice.event.starts_at.slice(0, 10))}
              </p>

              <table className="mt-5 w-full text-left">
                <thead>
                  <tr className="border-b border-line">
                    <th className="t-micro py-2">Item</th>
                    <th className="t-micro py-2 text-right">Qty</th>
                    <th className="t-micro py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lines.map((line, i) => (
                    <tr key={i} className="border-b border-line">
                      <td className="py-2 text-[14px]">{line.description}</td>
                      <td className="t-mono py-2 text-right text-[14px]">{line.quantity}</td>
                      <td className="t-mono py-2 text-right text-[14px]">{money(Number(line.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <dl className="mt-3 space-y-1">
                <div className="flex justify-between">
                  <dt className="t-small text-muted">Subtotal</dt>
                  <dd className="t-mono text-[14px]">{money(Number(invoice.subtotal))}</dd>
                </div>
                {Number(invoice.discount) > 0 && (
                  <div className="flex justify-between">
                    <dt className="t-small text-muted">Discount</dt>
                    <dd className="t-mono text-[14px]">−{money(Number(invoice.discount))}</dd>
                  </div>
                )}
                {Number(invoice.booking_fee) > 0 && (
                  <div className="flex justify-between">
                    <dt className="t-small text-muted">Booking fee</dt>
                    <dd className="t-mono text-[14px]">{money(Number(invoice.booking_fee))}</dd>
                  </div>
                )}
                {invoice.is_tax_invoice && (
                  <>
                    <div className="flex justify-between">
                      <dt className="t-small text-muted">CGST</dt>
                      <dd className="t-mono text-[14px]">{money(Number(invoice.cgst))}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="t-small text-muted">SGST</dt>
                      <dd className="t-mono text-[14px]">{money(Number(invoice.sgst))}</dd>
                    </div>
                  </>
                )}
                <div className="flex justify-between border-t border-line pt-2">
                  <dt className="text-[15px]">Total</dt>
                  <dd className="t-mono text-[16px] font-medium">{money(Number(invoice.total))}</dd>
                </div>
              </dl>
              {!invoice.is_tax_invoice && (
                <p className="t-small mt-3 text-muted">
                  No GST is currently charged, so this is a receipt rather than a tax invoice.
                </p>
              )}
              <Button className="mt-6" onClick={() => window.print()}>
                Print
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </PublicShell>
  );
}
