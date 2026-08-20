import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import { dateListing } from "@/lib/format";

/** Section 7.5 — guest details. Consent is required; the CTA stays disabled until it is ticked. */
export function CheckoutDetailsScreen() {
  const navigate = useNavigate();
  const { checkout, eventById, setGuestDetails } = useStore();
  const { open: openAuth } = useAuthSheet();
  const event = checkout.eventId ? eventById(checkout.eventId) : undefined;

  const [name, setName] = useState("Meera Raghavan");
  const [phone, setPhone] = useState("+91 98450 11223");
  const [email, setEmail] = useState("meera@example.com");
  const [consent, setConsent] = useState(false);

  if (!event) return <Navigate to="/" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setGuestDetails({ name, phone, email }, true);
    navigate("/checkout/pay");
  };

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[560px] px-4 py-8 md:py-12">
        <p className="t-micro">Step 1 of 2</p>
        <h1 className="t-h1 mt-2">Who's this ticket for?</h1>
        <p className="t-small mt-2 text-muted">
          {event.name} · {dateListing(event.date)} · {checkout.tierName}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-5">
          <Field label="Full name" htmlFor="guest-name">
            <Input
              id="guest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </Field>
          <Field label="Phone" htmlFor="guest-phone">
            <Input
              id="guest-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="t-mono"
              required
            />
          </Field>
          <Field
            label="Email"
            htmlFor="guest-email"
            hint="Your ticket and QR go here as well as to your phone."
          >
            <Input
              id="guest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 border border-line p-4">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[#FF3D6E]"
              required
            />
            <span className="t-small">
              I agree to Naada storing these details to issue and verify my ticket.{" "}
              <a href="#privacy" className="link-underline text-paper">
                Privacy policy →
              </a>
            </span>
          </label>

          <Button type="submit" variant="primary" full disabled={!consent}>
            Continue to payment
          </Button>

          <p className="t-small text-center text-muted">
            Already have an account?{" "}
            <button
              type="button"
              className="link-underline text-paper"
              onClick={() =>
                openAuth("Log in to book", { onDone: () => navigate("/checkout/pay") })
              }
            >
              Log in instead
            </button>
          </p>
        </form>
      </div>
    </PublicShell>
  );
}
