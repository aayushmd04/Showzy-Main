import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { usePageMeta } from "@/lib/use-meta";
import { getSiteConfig, type SiteConfig } from "@/lib/api";

/**
 * Razorpay will not activate an Indian merchant account until Terms, Privacy,
 * a Refund/Cancellation policy and reachable contact details all resolve on
 * the live domain, so these are a launch dependency rather than paperwork.
 *
 * Everything the operator must supply is gathered here: fill these in once and
 * every document updates. Values still marked TO BE COMPLETED will render a
 * visible warning, because shipping a policy that says "[Company]" fails
 * merchant review.
 */
/**
 * Placeholders shown only until the operator fills these in on the backend.
 * They are deliberately obvious rather than plausible — a policy that quietly
 * names the wrong company is worse than one that says it is unfinished.
 */
const PLACEHOLDER: SiteConfig = {
  name: "Showzy",
  legal_name: "[your registered company name]",
  address: "[your registered office address]",
  email: "[support email]",
  phone: "[support phone]",
  gstin: "",
  grievance_officer: "[grievance officer name]",
  policies_updated: "",
  missing: [],
  is_complete: false,
  booking_fee: 0,
  gst_configured: false,
};

const FIELD_LABEL: Record<string, string> = {
  legal_name: "registered company name",
  address: "registered office address",
  email: "support email",
  phone: "support phone",
  grievance_officer: "grievance officer",
};

type Doc = "terms" | "privacy" | "refunds" | "contact";

const TITLES: Record<Doc, { title: string; blurb: string }> = {
  terms: {
    title: "Terms of Service",
    blurb: "The agreement between you and Showzy when you use this site.",
  },
  privacy: {
    title: "Privacy Policy",
    blurb: "What we collect, why we collect it, and the rights you have over it.",
  },
  refunds: {
    title: "Refunds & Cancellations",
    blurb: "When you get your money back, how much, and how long it takes.",
  },
  contact: {
    title: "Contact Us",
    blurb: "How to reach a person at Showzy.",
  },
};

const NAV: { doc: Doc; to: string }[] = [
  { doc: "terms", to: "/terms" },
  { doc: "privacy", to: "/privacy" },
  { doc: "refunds", to: "/refunds" },
  { doc: "contact", to: "/contact" },
];

function S({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="t-h3">{heading}</h2>
      <div className="t-body mt-2 space-y-3 text-paper/85">{children}</div>
    </section>
  );
}

export function LegalScreen({ doc }: { doc: Doc }) {
  const { title, blurb } = TITLES[doc];
  usePageMeta({ title, description: blurb });

  // Operator details live on the backend so they can be filled in at deploy
  // time without editing this file or rebuilding the site.
  const [config, setConfig] = useState<SiteConfig | null>(null);
  useEffect(() => {
    getSiteConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const LEGAL_ENTITY = {
    name: config?.name || PLACEHOLDER.name,
    legalName: config?.legal_name || PLACEHOLDER.legal_name,
    address: config?.address || PLACEHOLDER.address,
    email: config?.email || PLACEHOLDER.email,
    phone: config?.phone || PLACEHOLDER.phone,
    gstin: config?.gstin || "",
    grievanceOfficer: config?.grievance_officer || PLACEHOLDER.grievance_officer,
    lastUpdated: config?.policies_updated || "—",
  };
  const missing = (config?.missing ?? []).map((k) => FIELD_LABEL[k] ?? k);

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[760px] px-4 py-10 md:py-16">
        <nav className="flex flex-wrap gap-x-5 gap-y-2 border-b border-line pb-4">
          {NAV.map(({ doc: d, to }) => (
            <Link
              key={d}
              to={to}
              className={
                d === doc
                  ? "t-micro text-signal"
                  : "t-micro text-muted transition-colors hover:text-paper"
              }
            >
              {TITLES[d].title}
            </Link>
          ))}
        </nav>

        <h1 className="t-h1 mt-8">{title}</h1>
        <p className="t-small mt-2 text-muted">{blurb}</p>
        <p className="t-micro mt-4">Last updated {LEGAL_ENTITY.lastUpdated}</p>

        {missing.length > 0 && (
          <div className="mt-6 border border-fault bg-fault/5 p-4">
            <p className="t-small text-fault">
              <strong>Not ready to publish.</strong> Still missing:{" "}
              {missing.join(", ")}. Set these on the backend — see{" "}
              <code className="t-mono">LEGAL_ENTITY_NAME</code> and the others in{" "}
              <code className="t-mono">.env.example</code> — and have a lawyer read
              this text before you take real money. A payment gateway rejects an
              application whose policies are incomplete.
            </p>
          </div>
        )}

        {doc === "terms" && (
          <>
            <S heading="1. Who we are">
              <p>
                Showzy is a marketplace for grassroots live music. We connect people
                who want to attend gigs with the venues that host them and the
                artists who play them. These terms are between you and{" "}
                {LEGAL_ENTITY.legalName}, operating as {LEGAL_ENTITY.name}.
              </p>
            </S>
            <S heading="2. What Showzy does and does not do">
              <p>
                We sell tickets on behalf of event organisers and handle payment
                between organisers and artists. We are not the organiser of the
                events listed here. The organiser is responsible for the event
                itself — that it happens, when it happens, who performs, and the
                conditions of entry.
              </p>
              <p>
                Where an event is cancelled or materially changed, our refund
                obligations are set out in the{" "}
                <Link to="/refunds" className="link-underline text-paper">
                  Refunds &amp; Cancellations policy
                </Link>
                .
              </p>
            </S>
            <S heading="3. Your account">
              <p>
                You sign in with a one-time code sent to your email. Keep access to
                that inbox secure — anyone who can read it can sign in as you. Tell
                us immediately at {LEGAL_ENTITY.email} if you think someone else has
                access to your account.
              </p>
              <p>
                You must be old enough to enter into a contract to buy a ticket.
                Individual events may set their own age restrictions, shown on the
                event page, and the venue enforces those at the door.
              </p>
            </S>
            <S heading="4. Tickets">
              <p>
                A ticket is a licence to attend a specific event, not property you
                own outright. Each ticket carries a unique QR code, valid for one
                entry. Once scanned it cannot be used again.
              </p>
              <p>
                Do not resell tickets above face value or through channels outside
                Showzy. We may cancel tickets we reasonably believe have been resold
                for profit or obtained fraudulently, and we will refund the original
                purchaser where we do.
              </p>
            </S>
            <S heading="5. For organisers and artists">
              <p>
                If you list an event, you confirm you have the right to run it at the
                stated venue and that the details you publish are accurate. If you
                accept a booking as an artist, you agree to perform as described in
                the accepted offer.
              </p>
              <p>
                Artist fees are held by Showzy and released after the performance
                under the terms of the accepted offer. Showzy charges the organiser
                a platform fee of 5% of the agreed fee, on top of that fee; artists
                are not charged it. Tax deducted at source (1%) is deducted from the
                artist's fee. Both are shown on the order before you accept it.
              </p>
            </S>
            <S heading="6. Behaviour">
              <p>
                Do not use Showzy to harass anyone, to advertise unrelated goods or
                services, or to move a booking conversation off the platform in order
                to avoid fees. We may suspend accounts that do.
              </p>
            </S>
            <S heading="7. When things go wrong">
              <p>
                We work hard to keep Showzy running, but we do not promise it will be
                uninterrupted or error-free. Where we are liable to you, our
                liability is limited to the amount you paid for the affected ticket
                or booking. Nothing here limits liability that cannot be limited
                under Indian law, including for death or personal injury caused by
                negligence, or for fraud.
              </p>
            </S>
            <S heading="8. Changes and governing law">
              <p>
                We may update these terms; the date at the top shows when they last
                changed, and material changes will be notified by email. These terms
                are governed by the laws of India, and the courts of Karnataka have
                exclusive jurisdiction.
              </p>
            </S>
          </>
        )}

        {doc === "privacy" && (
          <>
            <S heading="1. The short version">
              <p>
                We collect what we need to sell you a ticket and get you through the
                door. We do not sell your personal data. You can ask us for a copy of
                your data or ask us to delete your account at any time from your{" "}
                <Link to="/settings" className="link-underline text-paper">
                  settings page
                </Link>
                .
              </p>
            </S>
            <S heading="2. What we collect">
              <p>
                <strong>You give us:</strong> your email address, and — if you choose
                to add them — your name, phone number and a short bio. Organisers and
                artists also give us the details of their venue or act.
              </p>
              <p>
                <strong>We record as you use Showzy:</strong> the events you view and
                book, the tickets you hold, messages you send through booking
                conversations, and technical information such as your IP address and
                browser, which we use for security and fraud prevention.
              </p>
              <p>
                <strong>We do not collect card details.</strong> Payments are handled
                by our payment gateway. Your card number never reaches Showzy's
                servers.
              </p>
            </S>
            <S heading="3. Why we are allowed to use it">
              <p>
                To perform our contract with you (issuing and validating tickets,
                paying artists); because we have a legitimate interest (keeping the
                platform secure, preventing fraud); because the law requires it (tax
                and accounting records); and, for marketing email only, because you
                consented — which you can withdraw at any time.
              </p>
            </S>
            <S heading="4. Who else sees it">
              <p>
                Event organisers see the name and contact details attached to tickets
                for their event, so they can admit you and contact you if the event
                changes. Artists and organisers in a booking conversation see each
                other's messages. Our payment gateway, email provider and hosting
                provider process data on our behalf under contract.
              </p>
              <p>We do not sell your personal data to anyone.</p>
            </S>
            <S heading="5. How long we keep it">
              <p>
                Ticket and payment records are kept as long as tax law requires.
                Account data is deleted when you delete your account, except where we
                must retain a transaction record. Booking conversations are retained
                while the booking is active and for a period afterwards in case of a
                dispute.
              </p>
            </S>
            <S heading="6. Your rights">
              <p>
                Under India's Digital Personal Data Protection Act, 2023 you can ask
                for access to your data, correction of it, or its erasure, and you can
                nominate someone to exercise these rights if you are unable to. Use
                the tools on your settings page, or write to{" "}
                {LEGAL_ENTITY.email}. Our grievance officer is{" "}
                {LEGAL_ENTITY.grievanceOfficer}, reachable at the same address, and we
                will respond within the timeframes the Act requires.
              </p>
            </S>
            <S heading="7. Cookies and local storage">
              <p>
                We store your sign-in token and a few interface preferences in your
                browser. These are necessary for the site to work. We do not use
                advertising cookies.
              </p>
            </S>
          </>
        )}

        {doc === "refunds" && (
          <>
            <S heading="If the event is cancelled">
              <p>
                You get a <strong>full refund</strong>, including any booking fee. We
                start the refund as soon as the organiser confirms the cancellation
                and you do not need to ask for it.
              </p>
            </S>
            <S heading="If the event is postponed or moved">
              <p>
                Your ticket stays valid for the new date or venue. If the new details
                do not work for you, you can request a full refund within{" "}
                <strong>7 days</strong> of us notifying you of the change.
              </p>
            </S>
            <S heading="If you simply change your mind">
              <p>
                Tickets are non-refundable once purchased, because an organiser has
                committed to costs on the strength of the sale. Some organisers
                choose to allow cancellations — where that applies, it is stated on
                the event page before you pay.
              </p>
              <p>
                Free events can be un-reserved at any time, and we would appreciate
                it if you did, so someone else can take the spot.
              </p>
            </S>
            <S heading="How long refunds take">
              <p>
                We start refunds within <strong>2 working days</strong> of approving
                them. Money reaches your account within{" "}
                <strong>5 to 7 working days</strong> after that, depending on your
                bank or card issuer. Refunds always go back to the original payment
                method — we cannot send them somewhere else.
              </p>
            </S>
            <S heading="Booking fees">
              <p>
                Where a booking fee applies it is shown separately before you pay. It
                is refunded when the event is cancelled or materially changed by the
                organiser, and retained where you cancel a refundable ticket by
                choice.
              </p>
            </S>
            <S heading="How to ask for a refund">
              <p>
                Open the ticket in{" "}
                <Link to="/tickets" className="link-underline text-paper">
                  My tickets
                </Link>{" "}
                and use the refund option, or write to {LEGAL_ENTITY.email} with your
                ticket number. If you are not happy with the outcome, contact our
                grievance officer, {LEGAL_ENTITY.grievanceOfficer}, at the same
                address.
              </p>
            </S>
          </>
        )}

        {doc === "contact" && (
          <>
            <S heading="Support">
              <p>
                Email <strong>{LEGAL_ENTITY.email}</strong> and a person will reply.
                For anything about a specific ticket, include the ticket number — it
                is on the ticket in{" "}
                <Link to="/tickets" className="link-underline text-paper">
                  My tickets
                </Link>
                .
              </p>
              <p>Phone: {LEGAL_ENTITY.phone}</p>
            </S>
            <S heading="Registered address">
              <p>
                {LEGAL_ENTITY.legalName}
                <br />
                {LEGAL_ENTITY.address}
              </p>
              <p>GSTIN: {LEGAL_ENTITY.gstin}</p>
            </S>
            <S heading="Grievance officer">
              <p>
                In line with Indian law, {LEGAL_ENTITY.grievanceOfficer} is our
                grievance officer and can be reached at {LEGAL_ENTITY.email}. Write
                to them if a complaint has not been resolved to your satisfaction
                through normal support.
              </p>
            </S>
            <S heading="For venues and artists">
              <p>
                If you run a venue or perform and want to list on Showzy, write to{" "}
                {LEGAL_ENTITY.email} and tell us where you are and what you do.
              </p>
            </S>
          </>
        )}

        <p className="t-small mt-12 border-t border-line pt-6 text-muted">
          Questions about any of this? Write to {LEGAL_ENTITY.email}.
        </p>
      </div>
    </PublicShell>
  );
}
