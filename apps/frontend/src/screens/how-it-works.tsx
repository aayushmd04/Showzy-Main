import { useNavigate } from "react-router-dom";
import { PublicShell } from "@/components/naada/public-shell";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";

const CARD_TOKENS = {
  dark:  { paper: "#F3E9D6", muted: "rgba(243,233,214,.55)", signal: "#C4472E", surface: "#1A1512", cardBorder: "rgba(243,233,214,.16)" },
  light: { paper: "#241C15", muted: "rgba(36,28,21,.62)",    signal: "#8C2B3E", surface: "#FFFCF4", cardBorder: "rgba(36,28,21,.16)" },
};

const LISTENER_STEPS = [
  { icon: "🔍", title: "Browse tonight's shows",    body: "Find live events near you — open mics, concerts, theatre, and classical nights in Mysuru and Bengaluru." },
  { icon: "🎟",  title: "Book in seconds",           body: "Select a tier, log in with your email, and your ticket is confirmed instantly. No app download needed." },
  { icon: "📱",  title: "Show your QR at the door",  body: "Your digital ticket lives in My Tickets. Show the QR and walk in. Zero booking fees." },
];

const ARTIST_STEPS = [
  { icon: "✍️",  title: "Build your profile",        body: "Add your genres, fee range, and bio. Hosts search our artist directory to find their lineup." },
  { icon: "💬",  title: "Negotiate in-app",           body: "Receive offers, counter-propose, and agree on a fee — all in the Naada message thread." },
  { icon: "🔒",  title: "Escrow keeps you safe",      body: "Once accepted, the host funds escrow. You get paid within 24 hours of the gig — no chasing invoices." },
];

const HOST_STEPS = [
  { icon: "🎵",  title: "Create your event",         body: "Set up the venue, date, ticket tiers, and a budget for the performer." },
  { icon: "🎨",  title: "Search & invite artists",   body: "Browse our verified artist directory by genre, city, and fee range." },
  { icon: "💸",  title: "Fund and forget",            body: "Lock the fee in escrow before the show. We release to the artist automatically after completion." },
];

function StepCard({ icon, title, body, tok }: { icon: string; title: string; body: string; tok: typeof CARD_TOKENS.dark }) {
  return (
    <div style={{ border: `1px solid ${tok.cardBorder}`, background: tok.surface, borderRadius: 6, padding: 24 }}>
      <div style={{ fontSize: 28, marginBottom: 12 }}>{icon}</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, color: tok.paper, margin: 0 }}>{title}</h3>
      <p style={{ fontSize: 14, color: tok.muted, marginTop: 8, lineHeight: 1.6 }}>{body}</p>
    </div>
  );
}

export function HowItWorksScreen() {
  const { theme } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const tok = isDark ? CARD_TOKENS.dark : CARD_TOKENS.light;

  return (
    <PublicShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "48px 24px 80px" }}>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: 64 }}>
          <h1 style={{ fontSize: 40, fontWeight: 800, color: tok.paper, margin: 0, lineHeight: 1.2 }}>
            How Naada works
          </h1>
          <p style={{ fontSize: 17, color: tok.muted, marginTop: 16, maxWidth: 560, margin: "16px auto 0", lineHeight: 1.6 }}>
            A three-sided platform connecting music lovers, independent artists, and venue hosts.
            Zero booking fees for listeners. Escrow-backed payments for artists.
          </p>
        </div>

        {/* Section: Listeners */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: tok.signal }}>For music lovers</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {LISTENER_STEPS.map((s) => <StepCard key={s.title} {...s} tok={tok} />)}
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => navigate("/")}
              style={{ background: tok.signal, border: "none", borderRadius: 999, padding: "10px 24px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "#F3E9D6", cursor: "pointer" }}
            >
              Browse tonight's shows →
            </button>
          </div>
        </section>

        <hr style={{ border: `none`, borderTop: `1px solid ${tok.cardBorder}`, margin: "0 0 56px" }} />

        {/* Section: Artists */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: tok.signal }}>For artists</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {ARTIST_STEPS.map((s) => <StepCard key={s.title} {...s} tok={tok} />)}
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => openAuth("Join as an artist")}
              style={{ background: tok.signal, border: "none", borderRadius: 999, padding: "10px 24px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "#F3E9D6", cursor: "pointer" }}
            >
              Join as an artist →
            </button>
          </div>
        </section>

        <hr style={{ border: `none`, borderTop: `1px solid ${tok.cardBorder}`, margin: "0 0 56px" }} />

        {/* Section: Hosts */}
        <section style={{ marginBottom: 56 }}>
          <div style={{ marginBottom: 24 }}>
            <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: tok.signal }}>For venues & hosts</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {HOST_STEPS.map((s) => <StepCard key={s.title} {...s} tok={tok} />)}
          </div>
          <div style={{ marginTop: 20 }}>
            <button
              onClick={() => openAuth("Join as a host")}
              style={{ background: tok.signal, border: "none", borderRadius: 999, padding: "10px 24px", fontFamily: "inherit", fontSize: 14, fontWeight: 700, color: "#F3E9D6", cursor: "pointer" }}
            >
              List your venue →
            </button>
          </div>
        </section>

        <hr style={{ border: `none`, borderTop: `1px solid ${tok.cardBorder}`, margin: "0 0 56px" }} />

        {/* FAQ */}
        <section>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: tok.paper, marginBottom: 24 }}>Common questions</h2>
          {[
            ["Is it really free for ticket buyers?", "Yes. Naada charges zero booking fees. The price you see is the price you pay."],
            ["How does the escrow work?", "When a host and artist agree on a fee, the host locks the amount in escrow before the show. After the gig is marked complete, the funds are released to the artist automatically within 24 hours."],
            ["What if the event is cancelled?", "If the host cancels, the escrowed funds are refunded in full. Ticket buyers also receive automatic refunds."],
            ["What cities are you in?", "We're live in Mysuru and Bengaluru. More cities coming soon."],
            ["Can I sign up as both an artist and a host?", "Currently each account has one role. If you need both, reach out to hello@naada.live."],
          ].map(([q, a]) => (
            <div key={q} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: `1px solid ${tok.cardBorder}` }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: tok.paper, margin: 0 }}>{q}</p>
              <p style={{ fontSize: 14, color: tok.muted, marginTop: 6, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </section>
      </div>
    </PublicShell>
  );
}
