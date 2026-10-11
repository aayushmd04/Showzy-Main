import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { usePageMeta } from "@/lib/use-meta";
import { getSiteConfig, type SiteConfig } from "@/lib/api";
import { LEGAL_VERSION } from "@/lib/legal";
import { openCookieSettings } from "@/lib/consent";

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
  name: "Naada",
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

type Doc = "terms" | "privacy" | "cookies" | "refunds" | "contact";

const TITLES: Record<Doc, { title: string; blurb: string }> = {
  terms: {
    title: "Terms of Service",
    blurb: "The agreement between you and Naada when you use this site.",
  },
  privacy: {
    title: "Privacy Policy",
    blurb: "What we collect, why we collect it, and the rights you have over it.",
  },
  cookies: {
    title: "Cookie Policy",
    blurb: "Exactly what Naada stores in your browser, why, and how to change it.",
  },
  refunds: {
    title: "Refunds & Cancellations",
    blurb: "When you get your money back, how much, and how long it takes.",
  },
  contact: {
    title: "Contact Us",
    blurb: "How to reach a person at Naada.",
  },
};

const NAV: { doc: Doc; to: string }[] = [
  { doc: "terms", to: "/terms" },
  { doc: "privacy", to: "/privacy" },
  { doc: "cookies", to: "/cookies" },
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

function T({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="t-micro border-b border-line text-muted">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-normal">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, i) => (
                <td key={i} className={i === 0 ? "px-3 py-2 align-top text-paper" : "px-3 py-2 align-top text-paper/80"}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    lastUpdated: config?.policies_updated || LEGAL_VERSION,
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
            <p className="t-body mt-6 text-paper/85">
              By signing in or buying a ticket you agree to these terms and to our{" "}
              <Link to="/privacy" className="link-underline text-paper">Privacy Policy</Link>. If you
              don't agree, please don't use Naada.
            </p>
            <S heading="1. Who we are">
              <p>
                Naada is a marketplace for grassroots live music. We connect people who want to attend
                gigs with the venues that host them and the artists who play them. These terms are
                between you and {LEGAL_ENTITY.legalName}, operating as {LEGAL_ENTITY.name}.
              </p>
            </S>
            <S heading="2. What Naada does and does not do">
              <p>
                We sell tickets on behalf of event organisers and handle payment between organisers and
                artists. We are not the organiser of the events listed here. The organiser is
                responsible for the event itself — that it happens, when it happens, who performs, the
                venue and its safety, and the conditions of entry.
              </p>
              <p>
                Where an event is cancelled or materially changed, our refund obligations are set out in
                the{" "}
                <Link to="/refunds" className="link-underline text-paper">
                  Refunds &amp; Cancellations policy
                </Link>
                .
              </p>
            </S>
            <S heading="3. Your account">
              <p>
                You sign in with a one-time code sent to your email. Keep access to that inbox secure —
                anyone who can read it can sign in as you. Tell us immediately at {LEGAL_ENTITY.email} if
                you think someone else has access to your account. Don't share your account or let
                someone else use it.
              </p>
              <p>
                You must be at least 18 to create an account and buy a ticket. If you are bringing
                children, you buy and remain responsible for the adults' tickets and the children's
                welfare; we do not collect information about children. Individual events may set their
                own age and entry rules, shown on the event page, which the venue enforces at the door.
              </p>
              <p>
                You can delete your account at any time from Settings. See the Privacy Policy for what is
                erased and what we must keep.
              </p>
            </S>
            <S heading="4. Tickets, seats and holds">
              <p>
                A ticket is a licence to attend a specific event, not property you own outright. Each
                ticket carries a unique QR code, valid for one entry. Once scanned it cannot be used
                again. Keep your QR private: anyone who has it can use it.
              </p>
              <p>
                When you start paying, we hold your tickets, and any table or seat you chose, for 15
                minutes. If payment isn't completed in that time the hold is released and someone else
                can book them.
              </p>
              <p>
                Choosing a table, seat or area is a request for the place as the organiser has drawn it;
                the organiser may need to adjust the room, in which case they will tell you and offer a
                comparable place or a refund. Baby chairs are a free extra, subject to what the organiser
                has made available, and are not a guarantee of any particular arrangement.
              </p>
              <p>
                You can transfer a ticket to another Naada account from the ticket page. Do not resell
                tickets above face value or through channels outside Naada. We may cancel tickets we
                reasonably believe have been resold for profit or obtained fraudulently, and we will
                refund the original purchaser where we do.
              </p>
            </S>
            <S heading="5. For organisers and artists">
              <p>
                If you list an event, you confirm you have the right to run it at the stated venue and
                that the details you publish — including your floor plan, capacity, facilities and
                prices — are accurate. If you accept a booking as an artist, you agree to perform as
                described in the accepted offer.
              </p>
              <p>
                Artist fees are held by Naada and released after the performance under the terms of the
                accepted offer. Naada charges the organiser a platform fee of 5% of the agreed fee, on top
                of that fee; artists are not charged it. Tax deducted at source (1%) is deducted from the
                artist's fee. Both are shown on the order before you accept it. Before you can be paid we
                must verify your identity and bank details (KYC); payouts are paused until we have.
              </p>
              <p>
                You are responsible for the people you give access to. If you invite someone to your event's
                gate team you confirm they know and agree, and that you will end their access when it is no
                longer needed. Gatekeepers may use what they see only to admit guests to that event.
              </p>
            </S>
            <S heading="6. Gatekeepers">
              <p>
                If an organiser invites you to check tickets, you may accept or decline. If you accept you
                may scan tickets and look up guests for that one event, during the window the app shows,
                and for no other purpose. You must not copy, keep or share the guest list or any guest's
                details. The organiser can end your access at any time.
              </p>
            </S>
            <S heading="7. Behaviour and content">
              <p>
                Do not use Naada to harass anyone, to advertise unrelated goods or services, or to move a
                booking conversation off the platform in order to avoid fees. Messages are screened for
                phone numbers, emails, payment handles and similar details; flagged messages are still
                delivered but may be reviewed by us. We may suspend accounts that break these rules.
              </p>
              <p>
                You keep ownership of photos, text and other material you upload. You give us a
                non-exclusive licence to host and display it on Naada for as long as it is there, and you
                promise you have the right to share it.
              </p>
            </S>
            <S heading="8. When things go wrong">
              <p>
                We work hard to keep Naada running, but we do not promise it will be uninterrupted or
                error-free. Where we are liable to you, our liability is limited to the amount you paid for
                the affected ticket or booking. Nothing here limits liability that cannot be limited under
                Indian law, including for death or personal injury caused by negligence, or for fraud, or
                your rights as a consumer.
              </p>
              <p>
                If you have a complaint, write to {LEGAL_ENTITY.email}. If it isn't resolved, contact our
                grievance officer ({LEGAL_ENTITY.grievanceOfficer}); details are on the{" "}
                <Link to="/contact" className="link-underline text-paper">Contact page</Link>.
              </p>
            </S>
            <S heading="9. Changes and governing law">
              <p>
                We may update these terms; the date at the top shows when they last changed, and material
                changes will be notified by email or in the app and, where the law needs it, we will ask
                you to agree again. These terms are governed by the laws of India, and the courts of
                Karnataka have exclusive jurisdiction.
              </p>
            </S>
          </>
        )}

        {doc === "privacy" && (
          <>
            <S heading="1. The short version">
              <p>
                We collect what we need to sell you a ticket and get you through the door. We do not sell
                your personal data, we have no advertising or tracking cookies, and you can download your
                data, correct it, withdraw consent or delete your account yourself from your{" "}
                <Link to="/settings" className="link-underline text-paper">
                  settings page
                </Link>
                .
              </p>
            </S>
            <S heading="2. Who is responsible for your data">
              <p>
                {LEGAL_ENTITY.legalName} ({LEGAL_ENTITY.name}) decides why and how your data is used — in
                the language of India's Digital Personal Data Protection Act, 2023 (the "Act"), we are the
                Data Fiduciary. Contact us at {LEGAL_ENTITY.email}. Our grievance officer is{" "}
                {LEGAL_ENTITY.grievanceOfficer}, at the same address.
              </p>
            </S>
            <S heading="3. What we collect">
              <p>
                <strong>You give us:</strong> your email address; and, if you choose to add them, your
                name, phone number, photo and short bio. Tickets carry the name, email and phone of the
                person attending. Artists and venue owners also give us business and payout details: PAN,
                GSTIN and bank account, used only for tax and paying you.
              </p>
              <p>
                <strong>About how you use Naada:</strong> events you view, save and book; your ticket
                tier and the table, seat or area you chose, and how many baby chairs you asked for (a
                number — nothing about any child); tickets you transfer or cancel; messages in booking
                conversations and event chats; reviews; gate-team invitations and, for gatekeepers, which
                tickets you scanned and when.
              </p>
              <p>
                <strong>Technical data:</strong> your IP address and browser details when you sign in,
                place an order or view an event, used for security, fraud prevention and counting
                visits. We do not use them for advertising.
              </p>
              <p>
                <strong>From others:</strong> an organiser who invites you to their gate team gives us your
                email or phone number so we can match the invitation to you. A friend who transfers you a
                ticket gives us your email address. A payment gateway tells us whether a payment
                succeeded.
              </p>
              <p>
                <strong>We do not collect card or UPI details.</strong> Payment is handled by our payment
                gateway; your card number never reaches Naada's servers.
              </p>
            </S>
            <S heading="4. Why we use it">
              <T
                head={["Purpose", "What we use", "Basis under the Act"]}
                rows={[
                  ["Issue and check tickets, seat you, send receipts", "Account, ticket and order details", "Your consent when you book, and legitimate use to give you what you asked for"],
                  ["Pay artists and venues; keep tax records", "Business, KYC and payment records", "Legal obligations; contract"],
                  ["Keep Naada secure and prevent fraud", "IP address, browser, sign-in and scan logs", "Legitimate use (security)"],
                  ["Tell you about events", "Email, city, preferences", "Your consent — off by default, withdraw any time in Settings"],
                  ["Resolve disputes and complaints", "Booking messages, orders, scan logs", "Legitimate use; legal claims"],
                ]}
              />
            </S>
            <S heading="5. Who else sees it">
              <p>
                We share the minimum each recipient needs, and we never sell personal data.
              </p>
              <T
                head={["Who", "What they see", "Why"]}
                rows={[
                  ["The event's organiser", "Name, ticket number, tier and seat of ticket holders; contact details you gave at booking", "To admit you and contact you if the event changes"],
                  ["Gatekeepers the organiser invited", "Name, ticket number, tier, seat — never your email or phone", "To check you in at the door"],
                  ["Artists and organisers in a conversation", "The messages and offers exchanged", "To agree and run a booking"],
                  ["Payment gateway (e.g. Razorpay)", "Amount, order reference, the payer's payment details on their own page", "To take and refund payments"],
                  ["Email delivery provider", "Your email address and the message", "To send sign-in codes, tickets and notices"],
                  ["Hosting, database and file-storage providers", "Everything we store, encrypted in transit", "To run Naada"],
                  ["Error-monitoring service (when enabled)", "Technical error details; we aim to keep personal data out", "To find and fix faults"],
                  ["Authorities", "Only what the law requires", "Legal process, tax, court orders"],
                ]}
              />
              <p>
                These providers act on our instructions under contract. Some may process data outside India;
                where they do we require equivalent protection.
              </p>
            </S>
            <S heading="6. Children">
              <p>
                Naada is for people aged 18 and over, and we do not knowingly collect personal data about
                children. Asking for a baby chair records a number, not a child. If you believe a child's
                data has reached us, write to us and we will remove it.
              </p>
            </S>
            <S heading="7. How long we keep it">
              <T
                head={["Data", "How long"]}
                rows={[
                  ["Account profile, preferences, saved events, notifications", "Until you delete your account"],
                  ["Sign-in codes", "10 minutes to use; erased with your account"],
                  ["Tickets, orders and payment records", "As long as tax and accounting law requires (currently up to 8 years) — kept without your name, email or phone after you delete your account"],
                  ["Business KYC and bank details", "Until you delete your account, or as the law requires for payouts already made"],
                  ["Booking conversations", "While the booking is active and for a period afterwards in case of dispute"],
                  ["Event-view and scan logs", "No longer than needed for security and dispute handling"],
                  ["Proof of what you agreed to", "Kept (without contact details) so we can show consent was asked for"],
                ]}
              />
              <p>
                Copies in routine backups are not restored and expire in the normal backup cycle.
              </p>
            </S>
            <S heading="8. Your rights">
              <p>Under the Act you can:</p>
              <ul className="list-disc space-y-1 pl-5">
                <li><strong>See your data</strong> — Settings → <em>Download my data</em> gives you a file of everything we hold.</li>
                <li><strong>Correct it</strong> — change your name, phone and bio in Settings, or write to us for anything else.</li>
                <li><strong>Erase it</strong> — Settings → <em>Delete account</em>. We confirm by emailed code, tell you first what will be erased and kept, and won't proceed while an event, booking or payout is pending.</li>
                <li><strong>Withdraw consent</strong> — switch off emails in Settings or change <button type="button" onClick={openCookieSettings} className="link-underline text-paper">cookie settings</button> at any time. Withdrawing doesn't affect what we did before.</li>
                <li><strong>Complain</strong> — to our grievance officer at {LEGAL_ENTITY.email}; we aim to reply within 30 days. If unresolved you may complain to the Data Protection Board of India.</li>
                <li><strong>Nominate someone</strong> to exercise these rights for you if you die or can't.</li>
              </ul>
            </S>
            <S heading="9. Security">
              <p>
                We use one-time codes instead of passwords, encrypt data in transit, limit who can see
                what (a gatekeeper cannot see your email or phone), and require a fresh emailed code
                before an account can be deleted. If a breach affects you we will tell you and the Data
                Protection Board as the Act requires.
              </p>
            </S>
            <S heading="10. Cookies">
              <p>
                We store only what the site needs, plus your language and theme if you say yes. No
                advertising or analytics cookies. Details, including every item and how long it lasts, are
                in the{" "}
                <Link to="/cookies" className="link-underline text-paper">Cookie Policy</Link>.
              </p>
            </S>
            <S heading="11. Changes">
              <p>
                If we change this policy in a way that matters we will tell you in the app or by email and
                update the date above. Earlier versions are available on request.
              </p>
            </S>
          </>
        )}

        {doc === "cookies" && (
          <>
            <S heading="The short version">
              <p>
                Naada uses <strong>no advertising, analytics or tracking cookies</strong> and loads no
                third-party scripts when you browse. We keep a handful of items in your browser so the site
                works, and — only if you say yes — your language and theme.
              </p>
              <p className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary" onClick={openCookieSettings}>
                  Change my cookie settings
                </button>
              </p>
            </S>
            <S heading="What we store">
              <T
                head={["Name", "Kind", "What it's for", "Category", "Lasts"]}
                rows={[
                  ["naada_consent", "Cookie (ours)", "Remembers your cookie choice", "Strictly necessary", "12 months"],
                  ["naada_access, naada_refresh", "Local storage", "Keeps you signed in, securely", "Strictly necessary", "1 hour (access) / up to 30 days (refresh); removed when you sign out"],
                  ["naada_door_queue", "Local storage", "Check-ins made offline, until they can be sent (hosts and gatekeepers)", "Strictly necessary", "Until sent"],
                  ["naada_venue_layout", "Local storage", "Unsaved floor-plan draft (hosts)", "Strictly necessary", "Until saved; removed when you sign out"],
                  ["naada.nearbyCity", "Session storage", "The city filter you picked while browsing", "Strictly necessary", "This tab only"],
                  ["naada-v2-shell, naada-v2-tickets", "Browser cache (service worker)", "Lets the site load, and your tickets open, with no signal at the door", "Strictly necessary", "Until updated; tickets removed when you sign out"],
                  ["naada_theme, naada_lang", "Local storage (with your OK) or session storage (without)", "Light/dark theme and language", "Preferences", "Until you clear it — or this tab only if you decline"],
                ]}
              />
            </S>
            <S heading="Third parties">
              <p>
                Our fonts and images are served by us, so your visit does not send your IP address to a font
                or image provider. The only third-party code is our payment gateway's checkout window, which
                loads <em>only when you press Pay</em>; it is run by the gateway under its own privacy and
                cookie policies and may set its own cookies to take payment securely and prevent fraud.
              </p>
            </S>
            <S heading="Your choices">
              <ul className="list-disc space-y-1 pl-5">
                <li>Use <strong>Cookie settings</strong> in the footer at any time to change your choice.</li>
                <li>Declining <em>Preferences</em> removes the saved language and theme; they last only until you close the tab.</li>
                <li>Strictly necessary items can't be switched off in Naada — blocking them in your browser will stop sign-in and tickets working.</li>
                <li>You can clear all of this from your browser's settings at any time.</li>
              </ul>
            </S>
            <S heading="If this changes">
              <p>
                If we ever add analytics or anything else optional, it will start switched <strong>off</strong>,
                we will ask you again, and this page will list it first.
              </p>
            </S>
          </>
        )}

        {doc === "refunds" && (
          <>
            <S heading="If the event is cancelled">
              <p>
                You get a <strong>full refund</strong>, including the booking fee. We start the refund as
                soon as the organiser confirms the cancellation and you do not need to ask for it.
              </p>
            </S>
            <S heading="If the event is postponed or moved">
              <p>
                Your ticket stays valid for the new date or venue. If the new details do not work for you,
                you can request a full refund within <strong>7 days</strong> of us notifying you of the
                change.
              </p>
            </S>
            <S heading="If you change your mind">
              <p>
                You can cancel a ticket yourself from <strong>My tickets</strong>. The rule is:
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <strong>More than 24 hours before the event starts:</strong> you get the{" "}
                  <strong>ticket price</strong> back. The booking fee is not refunded.
                </li>
                <li>
                  <strong>Within 24 hours of the start:</strong> the ticket is cancelled and the seat is
                  freed, but the <strong>ticket price is not refunded</strong>.
                </li>
              </ul>
              <p>
                The cancel screen tells you the exact amount before you confirm. Free tickets can be
                cancelled at any time, and we'd appreciate it if you did, so someone else can take the spot.
              </p>
            </S>
            <S heading="How long refunds take">
              <p>
                We start refunds within <strong>2 working days</strong> of approving them. Money reaches
                your account within <strong>5 to 7 working days</strong> after that, depending on your bank
                or card issuer. Refunds always go back to the original payment method — we cannot send them
                somewhere else.
              </p>
            </S>
            <S heading="Booking fees">
              <p>
                The booking fee is shown separately before you pay. It is refunded when the event is
                cancelled or materially changed by the organiser, and retained where you cancel by choice.
              </p>
            </S>
            <S heading="Transferred tickets">
              <p>
                If you transfer a ticket, the person who receives it can cancel it under the rules above and
                any refund goes to the original payment method.
              </p>
            </S>
            <S heading="How to ask for a refund">
              <p>
                Open the ticket in{" "}
                <Link to="/tickets" className="link-underline text-paper">
                  My tickets
                </Link>{" "}
                and use <strong>Cancel</strong>, or write to {LEGAL_ENTITY.email} with your ticket number. If
                you are not happy with the outcome, contact our grievance officer,{" "}
                {LEGAL_ENTITY.grievanceOfficer}, at the same address.
              </p>
            </S>
          </>
        )}

        {doc === "contact" && (
          <>
            <S heading="Support">
              <p>
                Email <strong>{LEGAL_ENTITY.email}</strong> and a person will reply. For anything about a
                specific ticket, include the ticket number — it is on the ticket in{" "}
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
              {LEGAL_ENTITY.gstin && <p>GSTIN: {LEGAL_ENTITY.gstin}</p>}
            </S>
            <S heading="Grievance officer">
              <p>
                In line with Indian law, {LEGAL_ENTITY.grievanceOfficer} is our grievance officer and can be
                reached at {LEGAL_ENTITY.email}. Write to them if a complaint — about a ticket, a refund,
                or how we handle your personal data — has not been resolved through normal support. We
                acknowledge complaints within 48 hours and aim to resolve them within 30 days.
              </p>
            </S>
            <S heading="Your data">
              <p>
                To see, correct or erase your data, use{" "}
                <Link to="/settings" className="link-underline text-paper">Settings</Link>. For anything you
                can't do there, write to the address above.
              </p>
            </S>
            <S heading="For venues and artists">
              <p>
                If you run a venue or perform and want to list on Naada, write to {LEGAL_ENTITY.email} and
                tell us where you are and what you do.
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
