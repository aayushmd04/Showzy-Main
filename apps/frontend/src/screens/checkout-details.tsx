import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { useVenueZones } from "@/components/naada/seat-picker";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { useStore } from "@/store/app-store";
import { ConsentCheck, PolicyLink } from "@/components/naada/consent-check";
import { recordConsent } from "@/lib/api";
import { LEGAL_VERSION } from "@/lib/legal";
import { dateListing } from "@/lib/format";

/** Section 7.5 — guest details. Consent is required; the CTA stays disabled until it is ticked. */
export function CheckoutDetailsScreen() {
  const navigate = useNavigate();
  const { checkout, eventById, setGuestDetails, currentUser } = useStore();
  const { open: openAuth } = useAuthSheet();
  const event = checkout.eventId ? eventById(checkout.eventId) : undefined;

  const [name, setName] = useState(currentUser?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [consent, setConsent] = useState(false);

  /*
   * Only to set expectations: if this venue has a floor plan, the next step
   * asks where they want to sit, and it is better to know that before filling
   * in a form. Silent when there is no plan, and never blocking either way.
   */
  const { phase: zonePhase, data: zoneData } = useVenueZones(checkout.eventId ?? "");
  const hasSeating =
    zonePhase === "ready" && !!zoneData?.has_layout && zoneData.bookable_count > 0;

  if (!event) return <Navigate to="/" replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setGuestDetails({ name, phone, email }, true);
    // Keep a record of this agreement when there's an account to attach it to.
    if (currentUser) void recordConsent("ticket_contact", LEGAL_VERSION, "checkout");
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
        {hasSeating && (
          <p className="t-small mt-2 text-paper/90">
            {zoneData?.venue_name} has a seating plan — you'll pick your table or area on the
            next step.
          </p>
        )}

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

          <ConsentCheck id="guest-consent" checked={consent} onChange={setConsent}>
            I agree to Naada storing these details to issue and verify my ticket, and to sharing my name and
            contact details with the organiser of {event.name} so they can admit me and reach me if the event
            changes. See the <PolicyLink to="/privacy">Privacy Policy</PolicyLink>.
          </ConsentCheck>

          <Button type="submit" variant="primary" full disabled={!consent}>
            Continue to payment
          </Button>

          <p className="t-small text-center text-muted">
            Already have an account?{" "}
            <button
              type="button"
              className="link-underline text-paper"
              onClick={() =>
                openAuth("Sign in to book", { onDone: () => navigate("/checkout/pay") })
              }
            >
              Sign in instead
            </button>
          </p>
        </form>
      </div>
    </PublicShell>
  );
}
