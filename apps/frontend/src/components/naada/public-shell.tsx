/**
 * Shared shell for all public (listener-facing) screens.
 * Uses the same design tokens as discover.tsx for visual consistency.
 */
import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/store/app-store";
import { AccountMenu } from "./account-menu";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { NotificationBell } from "@/components/naada/notification-bell";

// Design tokens — mirrors discover.tsx exactly
const T = {
  dark: {
    bg:              "#120E0B",
    navBg:           "rgba(18,14,11,.88)",
    navBorder:       "rgba(243,233,214,.14)",
    paper:           "#F3E9D6",
    muted:           "rgba(243,233,214,.55)",
    signal:          "#C4472E",
    logoName:        "#E8B85C",
    logoKn:          "#C4472E",
    navLinkActive:   "#F3E9D6",
    navLinkInactive: "rgba(243,233,214,.55)",
    navActiveBorder: "#E8B85C",
    footerBg:        "#1A1512",
    footerBorder:    "rgba(243,233,214,.14)",
    btnBorder:       "rgba(243,233,214,.25)",
    surface:         "#1A1512",
  },
  light: {
    bg:              "#F7F0E2",
    navBg:           "rgba(255,252,244,.92)",
    navBorder:       "rgba(36,28,21,.14)",
    paper:           "#241C15",
    muted:           "rgba(36,28,21,.62)",
    signal:          "#8C2B3E",
    logoName:        "#8C2B3E",
    logoKn:          "#D98324",
    navLinkActive:   "#241C15",
    navLinkInactive: "rgba(36,28,21,.62)",
    navActiveBorder: "#8C2B3E",
    footerBg:        "#FFFCF4",
    footerBorder:    "rgba(36,28,21,.14)",
    btnBorder:       "rgba(36,28,21,.25)",
    surface:         "#FFFCF4",
  },
};

function NaadaLogo({ tok }: { tok: typeof T.dark }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "'Baloo Tamma 2',system-ui", fontWeight: 800, fontSize: 22, lineHeight: 1, color: tok.logoName }}>
        Naada
      </span>
      <span style={{ fontFamily: "'Anek Kannada',sans-serif", fontWeight: 600, fontSize: 16, color: tok.logoKn }}>
        ನಾದ
      </span>
    </div>
  );
}

const NAV_LINKS = [
  { label: "What's on", path: "/" },
  { label: "Artists",   path: "/artists" },
  { label: "Venues",    path: "/venues" },
  { label: "How it works", path: "/how-it-works" },
];

export function PublicShell({ children }: { children: ReactNode }) {
  const { role, theme, setTheme, currentUser } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const location = useLocation();
  const isDark = theme === "dark";
  const tok = isDark ? T.dark : T.light;

  const isLoggedIn = role !== "out" && currentUser !== null;

  return (
    <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", background: tok.bg, fontFamily: "'Archivo', sans-serif" }}>
      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: tok.navBg,
          borderBottom: `1px solid ${tok.navBorder}`,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
        }}
      >
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", height: 64, padding: "0 24px", gap: 32 }}>
          {/* Logo */}
          <Link to="/" style={{ textDecoration: "none", flexShrink: 0 }}>
            <NaadaLogo tok={tok} />
          </Link>

          {/* Nav links. `.discover-nav-links` is what hides these below 900px
              — it carries the `display: flex` too, because an inline
              `display: flex` here beat the media query's `display: none` and
              the links were never actually hidden on a phone. The page then
              measured 681px inside a 375px viewport and scrolled sideways. */}
          <nav className="discover-nav-links" style={{ alignItems: "center" }}>
            {NAV_LINKS.map(({ label, path }) => {
              const active = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
              return (
                <Link
                  key={path}
                  to={path}
                  style={{
                    textDecoration: "none",
                    fontSize: 15,
                    fontWeight: 600,
                    color: active ? tok.navLinkActive : tok.navLinkInactive,
                    borderBottom: active ? `2px solid ${tok.navActiveBorder}` : "none",
                    paddingBottom: active ? 2 : 0,
                    whiteSpace: "nowrap",
                    transition: "color .15s",
                  }}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Right side */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            {/* Theme toggle */}
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Toggle theme"
              style={{
                minHeight: 36, width: 36, border: `1.5px solid ${tok.btnBorder}`,
                background: "transparent", borderRadius: 999, fontSize: 15,
                cursor: "pointer", color: tok.paper,
              }}
            >
              {isDark ? "☀" : "🌙"}
            </button>

            {/* My Tickets (logged in listeners) */}
            {role === "listener" && isLoggedIn && (
              <Link
                to="/tickets"
                style={{ fontSize: 14, fontWeight: 600, color: tok.muted, textDecoration: "none", whiteSpace: "nowrap" }}
              >
                My Tickets
              </Link>
            )}

            {/* Renders nothing at all when signed out — no bell, no request. */}
            <NotificationBell />

            {/* Account avatar or Sign in */}
            {isLoggedIn ? (
              <AccountMenu />
            ) : (
              <button
                onClick={() => openAuth("Sign in to Naada", {
                  onDone: (_outcome, nextRole) => {
                    if (nextRole === "host") navigate("/host");
                    else if (nextRole === "artist") navigate("/artist");
                  },
                })}
                style={{
                  background: tok.signal, border: "none", borderRadius: 999,
                  padding: "8px 20px", fontFamily: "inherit", fontSize: 14,
                  fontWeight: 700, color: "#F3E9D6", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                Sign in
              </button>
            )}
          </div>
        </div>

        {/* Phone-only section links, matching the home page's row. Without
            this, hiding the links above would leave Artists, Venues and How
            it works reachable only from the footer. */}
        <div
          className="discover-nav-mobile"
          style={{ borderTop: `1px solid ${tok.navBorder}` }}
        >
          {NAV_LINKS.map(({ label, path }) => {
            const active = path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);
            return (
              <Link
                key={path}
                to={path}
                style={{
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                  fontSize: 14,
                  fontWeight: 600,
                  padding: "8px 14px",
                  borderRadius: 999,
                  flexShrink: 0,
                  color: active ? "#F3E9D6" : tok.navLinkInactive,
                  background: active ? tok.signal : "transparent",
                  border: `1px solid ${active ? tok.signal : tok.navBorder}`,
                }}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, color: tok.paper }}>{children}</main>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: `1px solid ${tok.footerBorder}`, background: tok.footerBg, marginTop: 64 }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "32px 24px" }}>
          <NaadaLogo tok={tok} />
          {/* Terms, Privacy, Refunds and Contact must be reachable from the
              site itself — a payment gateway's merchant review checks for them,
              and a buyer looking for a refund policy should not have to guess
              the URL. */}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
            {[
              ...NAV_LINKS.slice(1),
              { label: "Terms", path: "/terms" },
              { label: "Privacy", path: "/privacy" },
              { label: "Refunds", path: "/refunds" },
              { label: "Contact", path: "/contact" },
            ].map(({ label, path }) => (
              <Link key={path} to={path} style={{ fontSize: 13, color: tok.muted, textDecoration: "none" }}>{label}</Link>
            ))}
          </div>
          <p style={{ fontSize: 13, color: tok.muted }}>
            Grassroots live music · Mysuru & Bengaluru
          </p>
        </div>
      </footer>
    </div>
  );
}
