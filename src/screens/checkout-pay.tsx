import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { StateToggle } from "@/components/naada/state-toggle";
import { useStore } from "@/store/app-store";
import { CONVENIENCE_FEE } from "@/data/fixtures";
import { dateListing, money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Section 7.6. Payments are fake: 800ms spinner, then success. There is no
 * payment SDK anywhere in this prototype, and a "simulate failure" link keeps
 * the error state demoable.
 */

const STATES = ["ready", "processing", "success", "failed"] as const;
type PayState = (typeof STATES)[number];

const METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card" },
  { id: "netbanking", label: "Netbanking" },
];

export function CheckoutPayScreen() {
  const navigate = useNavigate();
  const { checkout, eventById, completePurchase } = useStore();
  const [state, setState] = useState<PayState>("ready");
  const [method, setMethod] = useState("upi");

  const event = checkout.eventId ? eventById(checkout.eventId) : undefined;
  const tier = event?.tiers.find((t) => t.name === checkout.tierName);

  useEffect(() => {
    if (state !== "processing") return;
    const timer = window.setTimeout(() => {
      const ticket = completePurchase();
      navigate(`/ticket/${ticket.code}?new=1`, { replace: true });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state, completePurchase, navigate]);

  if (!event || !tier) return <Navigate to="/" replace />;

  const fee = tier.price > 0 ? CONVENIENCE_FEE : 0;
  const total = tier.price + fee;

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[560px] px-4 py-8 md:py-12">
        <div className="flex items-center justify-between gap-3">
          <p className="t-micro">Step 2 of 2</p>
          <StateToggle value={state} options={STATES} onChange={setState} />
        </div>

        <h1 className="t-h1 mt-2">Payment</h1>

        <section className="mt-6 border border-line bg-surface">
          <h2 className="t-micro border-b border-line px-4 py-3">Order</h2>
          <div className="px-4 py-4">
            <p className="t-h3">{event.name}</p>
            <p className="t-small mt-1 text-muted">
              {dateListing(event.date)} · {tier.name} × {checkout.qty}
            </p>

            <dl className="mt-4 space-y-1.5 border-t border-line pt-4">
              <div className="flex justify-between gap-4">
                <dt className="t-small text-muted">Ticket</dt>
                <dd className="t-mono text-[14px]">
                  {tier.price === 0 ? "FREE" : money(tier.price)}
                </dd>
              </div>
              {fee > 0 && (
                <div className="flex justify-between gap-4">
                  <dt className="t-small text-muted">Convenience fee</dt>
                  <dd className="t-mono text-[14px]">{money(fee)}</dd>
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

        {state === "failed" ? (
          <section className="mt-6 border border-fault bg-surface p-5">
            <h2 className="t-h2 text-fault">Payment didn't go through</h2>
            <p className="t-body mt-2 text-paper/90">
              No money was taken. Your seats are held for 8 more minutes.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => setState("processing")}>
                Try again
              </Button>
              <Button onClick={() => setState("ready")}>Change payment method</Button>
            </div>
          </section>
        ) : (
          <section className="mt-6">
            <h2 className="t-micro">Pay with</h2>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Payment method">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={method === m.id}
                  onClick={() => setMethod(m.id)}
                  className={cn(
                    "flex min-h-11 items-center justify-center gap-2 border px-3 text-[14px] transition-colors",
                    method === m.id
                      ? "border-paper bg-surface-2 text-paper"
                      : "border-line text-muted hover:text-paper",
                  )}
                >
                  <span aria-hidden="true">{method === m.id ? "◉" : "○"}</span>
                  {m.label}
                </button>
              ))}
            </div>

            <Button
              variant="primary"
              full
              className="mt-6"
              disabled={state === "processing"}
              onClick={() => setState("processing")}
            >
              {state === "processing" ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Processing
                </>
              ) : (
                `Pay ${total === 0 ? "nothing — reserve" : money(total)}`
              )}
            </Button>

            <button
              type="button"
              onClick={() => setState("failed")}
              className="t-small mx-auto mt-4 block text-muted link-underline hover:text-paper"
            >
              Simulate a failed payment
            </button>
          </section>
        )}

        <p className="t-small mt-8 text-center text-muted">
          Prototype only. No payment provider is connected and no card details are collected.
        </p>
      </div>
    </PublicShell>
  );
}
