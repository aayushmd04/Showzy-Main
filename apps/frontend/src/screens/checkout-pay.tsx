import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, Loader2, Lock, ShieldCheck } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { dateListing, money } from "@/lib/format";
import * as api from "@/lib/api";
import { ApiError } from "@/lib/api";

type Phase =
  | "review"       // showing the order, nothing reserved yet
  | "reserving"    // creating the order server-side
  | "paying"       // gateway sheet is open
  | "verifying"    // confirming the payment with our backend
  | "failed";

const RAZORPAY_SDK = "https://checkout.razorpay.com/v1/checkout.js";

interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayCtor {
  new (options: Record<string, unknown>): { open: () => void };
}

function loadRazorpay(): Promise<RazorpayCtor> {
  const existing = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = RAZORPAY_SDK;
    tag.async = true;
    tag.onload = () => {
      const ctor = (window as unknown as { Razorpay?: RazorpayCtor }).Razorpay;
      ctor ? resolve(ctor) : reject(new Error("Razorpay SDK loaded but unavailable"));
    };
    tag.onerror = () => reject(new Error("Could not reach the payment provider"));
    document.body.appendChild(tag);
  });
}

export function CheckoutPayScreen() {
  const navigate = useNavigate();
  const { checkout, eventById, currentUser, hydrateFromApi, clearCheckout, toast, role } =
    useStore();
  const { open: openAuth } = useAuthSheet();

  const [phase, setPhase] = useState<Phase>("review");
  const [error, setError] = useState<string | null>(null);
  const [promo, setPromo] = useState("");
  const [promoState, setPromoState] = useState<api.PromoValidation | null>(null);
  const [promoChecking, setPromoChecking] = useState(false);
  const [mockSheet, setMockSheet] = useState<api.InitiatePaymentResponse | null>(null);
  const cancelled = useRef(false);

  useEffect(() => () => { cancelled.current = true; }, []);

  const event = checkout.eventId ? eventById(checkout.eventId) : undefined;
  const tier = event?.tiers.find((t) => t.name === checkout.tierName);
  const qty = checkout.qty || 1;

  const ticketTotal = (tier?.price ?? 0) * qty;
  const discount = promoState?.valid ? promoState.discount_amount ?? 0 : 0;
  const total = Math.max(0, ticketTotal - discount);
  const isFree = ticketTotal === 0;

  const finish = useCallback(
    async (eventId: string) => {
      await hydrateFromApi().catch(() => {});
      clearCheckout();
      // The server issues the ticket number; find the newest one for this event.
      try {
        const mine = await api.getMyTickets();
        const match = mine.results
          .filter((t) => t.event?.id === eventId)
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (match) {
          navigate(`/ticket/${match.ticket_number}?new=1`, { replace: true });
          return;
        }
      } catch {
        /* fall through to the list */
      }
      navigate("/tickets", { replace: true });
    },
    [hydrateFromApi, clearCheckout, navigate],
  );

  const confirm = useCallback(
    async (orderId: string, eventId: string, payload: {
      gateway_order_id: string;
      gateway_payment_id: string;
      gateway_signature: string;
    }) => {
      setPhase("verifying");
      try {
        await api.verifyPayment({ order_id: orderId, ...payload });
        await finish(eventId);
      } catch (err) {
        if (cancelled.current) return;
        setPhase("failed");
        setError(
          err instanceof ApiError
            ? err.detail
            : "We could not confirm the payment. If money left your account, it will be returned.",
        );
      }
    },
    [finish],
  );

  const checkPromo = async () => {
    if (!promo.trim() || !event) return;
    setPromoChecking(true);
    try {
      const result = await api.validatePromo({
        code: promo.trim(),
        event_id: event.id,
        order_amount: ticketTotal,
      });
      setPromoState(result);
      toast(result.valid ? "Promo applied" : result.detail ?? "That code didn't work",
            result.valid ? "success" : "fault");
    } catch {
      setPromoState({ valid: false, detail: "Could not check that code" });
      toast("Could not check that code", "fault");
    } finally {
      setPromoChecking(false);
    }
  };

  const pay = async () => {
    if (!event || !tier) return;

    if (role === "out") {
      openAuth("Sign in to complete your booking");
      return;
    }
    if (!tier.id) {
      setPhase("failed");
      setError(
        "This event is sample data and can't be booked. Events created through the host console can.",
      );
      return;
    }

    setError(null);
    setPhase("reserving");

    try {
      // 1. Reserve inventory server-side. This is what actually holds the seat.
      const order = await api.createTicketOrder({
        event_id: event.id,
        items: [{ tier_id: tier.id, quantity: qty }],
        promo_code: promoState?.valid ? promo.trim() : undefined,
      });

      // 2. Ask the backend to open a payment against it.
      const intent = await api.initiatePayment({ order_id: order.id });

      // Free and complimentary orders are confirmed by the backend immediately.
      if (intent.status === "success") {
        await finish(event.id);
        return;
      }

      if (intent.is_mock) {
        // No Razorpay account yet: the backend signs a simulated payment with
        // the same HMAC the live gateway uses, so verification runs for real.
        setMockSheet(intent);
        setPhase("paying");
        return;
      }

      // 3. Live Razorpay.
      const Razorpay = await loadRazorpay();
      setPhase("paying");
      const rzp = new Razorpay({
        key: intent.razorpay_key,
        order_id: intent.gateway_order_id,
        amount: intent.amount,
        currency: intent.currency ?? "INR",
        name: "Naada",
        description: `${event.name} · ${tier.name}`,
        prefill: {
          name: currentUser?.full_name ?? checkout.guest.name,
          email: currentUser?.email ?? checkout.guest.email,
          contact: checkout.guest.phone,
        },
        theme: { color: "#D4380D" },
        handler: (res: RazorpayResponse) =>
          confirm(order.id, event.id, {
            gateway_order_id: res.razorpay_order_id,
            gateway_payment_id: res.razorpay_payment_id,
            gateway_signature: res.razorpay_signature,
          }),
        modal: {
          ondismiss: () => {
            if (cancelled.current) return;
            setPhase("review");
            toast("Payment cancelled — your seats are held for a few more minutes");
          },
        },
      });
      rzp.open();
    } catch (err) {
      if (cancelled.current) return;
      setPhase("failed");
      setError(err instanceof ApiError ? err.detail : (err as Error).message);
    }
  };

  const completeMock = async (outcome: "success" | "failed") => {
    if (!mockSheet || !event) return;
    setMockSheet(null);
    setPhase("verifying");
    try {
      // The browser can't sign — the secret is server-side — so the backend
      // mints the payment id and a real HMAC, and we then go through the very
      // same verify endpoint a live Razorpay callback would.
      const res = await api.completeMockPayment({
        order_id: mockSheet.order_id,
        gateway_order_id: mockSheet.gateway_order_id ?? "",
        outcome,
      });

      if (res.status !== "success" || !res.gateway_payment_id || !res.gateway_signature) {
        setPhase("failed");
        setError(
          res.status === "pending"
            ? "The payment is still pending with the bank. We'll confirm your ticket as soon as it clears."
            : res.error?.description ?? "The payment was declined. No money was taken.",
        );
        return;
      }

      await confirm(mockSheet.order_id, event.id, {
        gateway_order_id: res.gateway_order_id ?? mockSheet.gateway_order_id ?? "",
        gateway_payment_id: res.gateway_payment_id,
        gateway_signature: res.gateway_signature,
      });
    } catch (err) {
      if (cancelled.current) return;
      setPhase("failed");
      setError(err instanceof ApiError ? err.detail : "Simulated payment failed");
    }
  };

  if (!event || !tier) return <Navigate to="/" replace />;

  const busy = phase === "reserving" || phase === "verifying";

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[560px] px-4 py-8 md:py-12">
        <p className="t-micro">Step 2 of 2</p>
        <h1 className="t-h1 mt-2">{isFree ? "Confirm your spot" : "Payment"}</h1>

        {/* ── Order summary ─────────────────────────────────────────── */}
        <section className="mt-6 border border-line bg-surface">
          <h2 className="t-micro border-b border-line px-4 py-3">Order</h2>
          <div className="px-4 py-4">
            <p className="t-h3">{event.name}</p>
            <p className="t-small mt-1 text-muted">
              {dateListing(event.date)} · {tier.name} × {qty}
            </p>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-4">
              <div className="flex justify-between gap-4">
                <dt className="t-small text-muted">Tickets</dt>
                <dd className="t-mono text-[14px]">
                  {ticketTotal === 0 ? "FREE" : money(ticketTotal)}
                </dd>
              </div>
              {discount > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="t-small text-live">Promo discount</dt>
                  <dd className="t-mono text-[14px] text-live">−{money(discount)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 border-t border-line pt-2">
                <dt className="text-[15px]">Total</dt>
                <dd className="t-mono text-[17px] font-medium">
                  {total === 0 ? "FREE" : money(total)}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* ── Promo code ────────────────────────────────────────────── */}
        {!isFree && phase === "review" && (
          <section className="mt-4">
            <label htmlFor="promo" className="t-micro">
              Promo code
            </label>
            <div className="mt-2 flex gap-2">
              <Input
                id="promo"
                value={promo}
                onChange={(e) => {
                  setPromo(e.target.value.toUpperCase());
                  setPromoState(null);
                }}
                placeholder="NAADA10"
                className="t-mono flex-1"
                autoComplete="off"
              />
              <Button
                type="button"
                onClick={checkPromo}
                disabled={!promo.trim() || promoChecking}
              >
                {promoChecking ? "Checking…" : "Apply"}
              </Button>
            </div>
            {promoState && !promoState.valid && (
              <p className="t-small mt-2 text-fault">{promoState.detail}</p>
            )}
          </section>
        )}

        {/* ── Failure ───────────────────────────────────────────────── */}
        {phase === "failed" && (
          <section className="mt-6 border border-fault bg-surface p-5">
            <h2 className="t-h2 flex items-center gap-2 text-fault">
              <AlertCircle className="size-5" aria-hidden="true" />
              Payment didn't go through
            </h2>
            <p className="t-body mt-2 text-paper/90">{error}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => { setPhase("review"); setError(null); }}>
                Try again
              </Button>
              <Button onClick={() => navigate(`/e/${event.id}`)}>Back to event</Button>
            </div>
          </section>
        )}

        {/* ── Pay ───────────────────────────────────────────────────── */}
        {phase !== "failed" && (
          <section className="mt-6">
            <Button variant="primary" full disabled={busy || phase === "paying"} onClick={pay}>
              {phase === "reserving" ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Holding your seats…</>
              ) : phase === "verifying" ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Confirming payment…</>
              ) : phase === "paying" ? (
                <><Loader2 className="size-4 animate-spin" aria-hidden="true" />Waiting for payment…</>
              ) : total === 0 ? (
                "Reserve my spot"
              ) : (
                `Pay ${money(total)}`
              )}
            </Button>

            <p className="t-small mt-4 flex items-center justify-center gap-1.5 text-muted">
              <Lock className="size-3.5" aria-hidden="true" />
              Payment is processed securely. Naada never sees your card details.
            </p>
          </section>
        )}
      </div>

      {/* ── Simulated payment sheet ─────────────────────────────────── */}
      {mockSheet && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mock-pay-title"
        >
          <div className="w-full max-w-[420px] border border-line bg-surface p-6">
            <div className="flex items-center gap-2 border-b border-line pb-3">
              <ShieldCheck className="size-4 text-signal" aria-hidden="true" />
              <h2 id="mock-pay-title" className="t-h3">Test payment</h2>
            </div>
            <p className="t-small mt-3 text-muted">
              Naada isn't connected to a live payment provider yet, so this stands in for
              the real sheet. Everything either side of it is real — the order, the
              signature check, and the ticket you get at the end.
            </p>
            <dl className="mt-4 flex justify-between border-t border-line pt-3">
              <dt className="t-small text-muted">Amount</dt>
              <dd className="t-mono text-[17px]">{money(total)}</dd>
            </dl>
            <div className="mt-5 flex flex-col gap-2">
              <Button variant="primary" full onClick={() => completeMock("success")}>
                Approve payment
              </Button>
              <Button full onClick={() => completeMock("failed")}>
                Decline payment
              </Button>
              <button
                type="button"
                onClick={() => { setMockSheet(null); setPhase("review"); }}
                className="t-small mt-1 text-muted transition-colors hover:text-paper"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PublicShell>
  );
}
