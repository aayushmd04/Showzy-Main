import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "@/store/app-store";
import { useAuthSheet } from "@/components/naada/auth-sheet";

/** Public shell — warm amber light theme. Wraps all listener-facing pages. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { role, users } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const { open: openAuth } = useAuthSheet();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (location.pathname !== "/") setQuery("");
  }, [location.pathname]);

  const account =
    role === "listener" ? users.listener
    : role === "artist" ? users.artist
    : role === "host"   ? users.host
    : null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/");
  };

  return (
    <div
      className="theme-light flex min-h-dvh flex-col"
      style={{ background: "#F4F1EB", fontFamily: "'Archivo', sans-serif", WebkitFontSmoothing: "antialiased" }}
    >
      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 border-b border-line"
        style={{ background: "rgba(251,243,227,0.88)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center gap-4 px-4 md:px-8">

          {/* Wordmark */}
          <Link to="/" aria-label="Naada home" className="flex shrink-0 items-center py-2 no-underline" style={{ textDecoration: "none" }}>
            <span style={{ fontSize: 19, letterSpacing: "-.05em", textTransform: "uppercase", color: "#111", display: "flex", alignItems: "center" }}>
              <span style={{ fontVariationSettings: "'wdth' 62,'wght' 900" }}>NAA</span>
              <span style={{ color: "#D4380D", margin: "0 1px", fontVariationSettings: "'wdth' 62,'wght' 900" }}>·</span>
              <span style={{ fontVariationSettings: "'wdth' 125,'wght' 900" }}>DA</span>
            </span>
          </Link>

          {/* Search */}
          <form role="search" onSubmit={submit} className="relative min-w-0 flex-1 md:mx-4">
            <div
              className="flex items-center gap-2 border border-line"
              style={{ background: "rgba(255,255,255,0.7)", backdropFilter: "blur(12px)", borderRadius: 6 }}
            >
              <span aria-hidden="true" className="pl-3 text-muted" style={{ fontSize: 15 }}>⌕</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search gigs, artists, venues…"
                aria-label="Search gigs and artists"
                style={{ flex: 1, minHeight: 40, border: "none", background: "transparent", fontFamily: "inherit", fontSize: 14, color: "#141210", outline: "none", padding: "0 4px" }}
              />
            </div>
          </form>

          {/* Right side */}
          <div className="flex shrink-0 items-center gap-3">
            {role !== "out" && (
              <Link
                to="/tickets"
                className="hidden md:flex items-center gap-1.5 text-[13px] text-muted no-underline transition-colors hover:text-paper"
                style={{ fontVariationSettings: "'wdth' 90,'wght' 500", textDecoration: "none" }}
              >
                My Tickets
              </Link>
            )}
            {account ? (
              <Link
                to={role === "host" ? "/host" : role === "artist" ? "/artist" : "/tickets"}
                aria-label={`Account — ${account.name}`}
                style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#D4380D,#C42E08)", color: "#fff", fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", boxShadow: "0 2px 12px rgba(212,56,13,.35)", flexShrink: 0 }}
              >
                {account.name.charAt(0)}
              </Link>
            ) : (
              <div style={{ padding: 1, borderRadius: 28, background: "linear-gradient(135deg,rgba(212,56,13,.6),rgba(212,56,13,.2))", boxShadow: "0 2px 8px rgba(212,56,13,.15)", flexShrink: 0 }}>
                <button
                  onClick={() => openAuth("Log in to Naada", {
                    onDone: (_outcome, role) => {
                      if (role === "host") navigate("/host");
                      else if (role === "artist") navigate("/artist");
                    },
                  })}
                  style={{ display: "block", background: "rgba(255,255,255,.65)", backdropFilter: "blur(8px)", border: "none", borderRadius: 27, padding: "7px 18px", fontFamily: "inherit", fontVariationSettings: "'wdth' 90,'wght' 700", fontSize: 13, color: "#C42E08", cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Log in
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="mt-16 border-t border-line">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-2 px-4 py-8 md:flex-row md:items-center md:justify-between md:px-8">
          <span style={{ fontSize: 15, letterSpacing: "-.05em", textTransform: "uppercase", color: "#111", display: "flex", alignItems: "center" }}>
            <span style={{ fontVariationSettings: "'wdth' 62,'wght' 900" }}>NAA</span>
            <span style={{ color: "#D4380D", margin: "0 1px", fontVariationSettings: "'wdth' 62,'wght' 900" }}>·</span>
            <span style={{ fontVariationSettings: "'wdth' 125,'wght' 900" }}>DA</span>
          </span>
          <p className="t-small text-muted">
            Grassroots live music in Mysuru. Prototype — no real payments, no real accounts.
          </p>
        </div>
      </footer>
    </div>
  );
}
