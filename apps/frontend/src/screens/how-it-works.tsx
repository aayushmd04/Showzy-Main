import { useNavigate } from "react-router-dom";
import {
  CalendarPlus,
  MessagesSquare,
  PenLine,
  QrCode,
  Search,
  SearchCheck,
  ShieldCheck,
  Ticket,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { PublicShell } from "@/components/naada/public-shell";
import { IconTile } from "@/components/naada/icon-tile";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { usePageMeta } from "@/lib/use-meta";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
}

const LISTENER_STEPS: Step[] = [
  { icon: Search, title: "Browse tonight's shows", body: "Find live events near you: open mics, theatre, dance, comedy and classical nights in Mysuru and Bengaluru." },
  { icon: Ticket, title: "Book in seconds", body: "Pick a ticket, sign in with your email, and it's confirmed. No app to download." },
  { icon: QrCode, title: "Show your QR at the door", body: "Your ticket lives in My Tickets. Show the code and walk in." },
];

const ARTIST_STEPS: Step[] = [
  { icon: PenLine, title: "Build your profile", body: "Add your art form, photos and bio. Hosts search the directory to fill their line-ups." },
  { icon: MessagesSquare, title: "Negotiate in-app", body: "Receive offers, counter, and agree a fee, all in one message thread." },
  { icon: ShieldCheck, title: "Escrow keeps you safe", body: "Once you accept, the host funds escrow. You're paid 72 hours after the gig unless a dispute is raised." },
];

const HOST_STEPS: Step[] = [
  { icon: CalendarPlus, title: "Create your event", body: "Set the venue, date, ticket types and a budget for the performer." },
  { icon: SearchCheck, title: "Search and invite artists", body: "Browse the artist directory by art form and city, and see each artist's fee range." },
  { icon: Wallet, title: "Fund and forget", body: "Lock the fee in escrow before the show. We release it to the artist after the night." },
];

const FAQ: Array<[string, string]> = [
  ["Is it free for ticket buyers?", "Browsing is free. Paid tickets carry a small booking fee of ₹19 per ticket, shown before you pay. Free events have no fee."],
  ["What does Showzy charge for artist bookings?", "Artists are not charged. The venue pays Showzy 5% on top of the agreed fee. The artist receives the agreed fee less 1% TDS, a statutory tax deduction."],
  ["How does the escrow work?", "When a host and artist agree a fee, the host locks the amount in escrow before the show. After the gig is marked complete, it's released to the artist 72 hours later, unless a dispute is raised."],
  ["What if the event is cancelled?", "If the host cancels, the escrowed funds are refunded in full. Ticket buyers also receive automatic refunds."],
  ["What cities are you in?", "We're live in Mysuru and Bengaluru. More cities coming soon."],
  ["Can I sign up as both an artist and a host?", "Currently each account has one role. If you need both, reach out to hello@naada.live."],
];

function Section({
  label,
  steps,
  cta,
  onCta,
}: {
  label: string;
  steps: Step[];
  cta: string;
  onCta: () => void;
}) {
  return (
    <section aria-label={label} className="mt-14 first:mt-0">
      <h2 className="font-megrim text-[clamp(22px,3vw,30px)] font-normal uppercase leading-tight tracking-[0.02em]">{label}</h2>
      <ol className="mt-5 grid gap-3 md:grid-cols-3 md:gap-4">
        {steps.map((s, i) => (
          <li key={s.title} className="glass-soft icon-tile-host relative flex flex-col gap-4 rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <IconTile icon={s.icon} />
              <span aria-hidden="true" className="font-megrim text-[34px] leading-none text-paper/15">
                {i + 1}
              </span>
            </div>
            <div>
              <h3 className="text-[17px] font-semibold">{s.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
      <button
        type="button"
        onClick={onCta}
        className="mt-5 min-h-11 rounded-full bg-signal px-6 text-[14.5px] font-bold text-white transition-opacity hover:opacity-90"
      >
        {cta}
      </button>
    </section>
  );
}

export function HowItWorksScreen() {
  usePageMeta({ title: "How it works", description: "How Showzy connects audiences, artists and venues, and what it costs." });
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();

  return (
    <PublicShell>
      <div className="mx-auto w-full max-w-[1100px] px-[var(--page-pad)] pb-20 pt-10 md:pt-14">
        <header className="max-w-[60ch]">
          <h1 className="font-megrim text-[clamp(32px,5vw,52px)] font-normal uppercase leading-none">How Showzy works</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted">
            A marketplace for live art with three sides: people who go, artists who perform, and rooms that host. Clear
            fees, shown before you pay. Escrow-backed payments for artists.
          </p>
        </header>

        <div className="mt-12">
          <Section label="For audiences" steps={LISTENER_STEPS} cta="Browse tonight's shows →" onCta={() => navigate("/whats-on")} />
          <Section label="For artists" steps={ARTIST_STEPS} cta="Join as an artist →" onCta={() => openAuth("Join as an artist", { preferRole: "artist" })} />
          <Section label="For venues and hosts" steps={HOST_STEPS} cta="List your venue →" onCta={() => openAuth("Host your event on Showzy", { preferRole: "host" })} />
        </div>

        <section aria-label="Common questions" className="mt-16">
          <h2 className="font-megrim text-[clamp(22px,3vw,30px)] font-normal uppercase leading-tight tracking-[0.02em]">Common questions</h2>
          <div className="mt-5 divide-y divide-[var(--glass-border-soft)] overflow-hidden rounded-2xl glass-soft">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-4 text-[15.5px] font-semibold [&::-webkit-details-marker]:hidden">
                  {q}
                  <span aria-hidden="true" className="text-signal transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="mt-2 max-w-[70ch] text-[14.5px] leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </PublicShell>
  );
}
