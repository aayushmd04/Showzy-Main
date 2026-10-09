/**
 * Shared shell for all public (listener-facing) screens.
 *
 * Laid out the way people already expect a ticketing site to be: wordmark,
 * one big search box, the city, and sign-in on the first row; a strip of
 * sections on the second. On a phone the search drops to its own row and the
 * strip scrolls sideways.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Moon, Search, Sun } from "lucide-react";

import { Wordmark } from "@/components/naada/wordmark";
import { CityPicker } from "@/components/naada/city-picker";
import { useStore } from "@/store/app-store";
import { AccountMenu } from "./account-menu";
import { useAuthSheet } from "@/components/naada/auth-sheet";
import { NotificationBell } from "@/components/naada/notification-bell";

const NAV_LINKS = [
  { label: "What's on", labelKn: "ಏನಿದೆ", path: "/whats-on", exact: true },
  { label: "Artists", labelKn: "ಕಲಾವಿದರು", path: "/artists" },
  { label: "Venues", labelKn: "ಸ್ಥಳಗಳು", path: "/venues" },
  { label: "How it works", labelKn: "ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ", path: "/how-it-works" },
];

function SearchBox({ className = "" }: { className?: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { lang } = useStore();
  const urlQ = location.pathname === "/whats-on" ? (params.get("q") ?? "") : "";
  const [q, setQ] = useState(urlQ);

  // Keep the box in step when the URL changes (back button, clearing a search).
  useEffect(() => setQ(urlQ), [urlQ]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/whats-on?q=${encodeURIComponent(term)}` : "/whats-on");
  };

  const placeholder =
    lang === "kn" ? "ಕಾರ್ಯಕ್ರಮ, ಕಲಾವಿದ, ಸ್ಥಳ ಹುಡುಕಿ" : "Search events, artists, venues";

  return (
    <form onSubmit={submit} role="search" className={`relative ${className}`}>
      <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] pl-10 pr-3 text-[15px] text-paper backdrop-blur-md placeholder:text-muted focus:border-signal focus:outline-none"
      />
    </form>
  );
}

function ThemeToggle({
  theme,
  setTheme,
  className = "",
}: {
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  className?: string;
}) {
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={() => setTheme(light ? "dark" : "light")}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      className={`glass-soft size-11 shrink-0 place-items-center rounded-md text-paper hover:border-paper/40 ${className || "grid"}`}
    >
      {light ? <Moon className="size-[18px]" aria-hidden /> : <Sun className="size-[18px]" aria-hidden />}
    </button>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { role, currentUser, lang, setLang, theme, setTheme } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const location = useLocation();
  const kn = lang === "kn";

  const isLoggedIn = role !== "out" && currentUser !== null;
  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path || location.pathname === "/" : location.pathname.startsWith(path);

  const afterSignIn = (_outcome: unknown, nextRole: string) => {
    if (nextRole === "host") navigate("/host");
    else if (nextRole === "artist") navigate("/artist");
  };

  return (
    <div className="relative isolate flex min-h-dvh flex-col font-sans text-paper">
      {/* Blurred photos fixed behind the page: what the glass panels sit on */}
      <div className="page-backdrop" aria-hidden>
        <img src="/media/events/crowd-under-stage-lights.jpg" alt="" className="-left-[20vmax] -top-[24vmax]" />
        <img src="/media/events/classical-dancer-stage.jpg" alt="" className="-bottom-[28vmax] -right-[22vmax]" />
      </div>
      <header className="glass-soft sticky top-0 z-40 rounded-none border-x-0 border-t-0 bg-[var(--glass-bar)]">
        {/* Row 1: brand, search, city, account */}
        <div className="flex h-16 w-full items-center gap-3 px-[var(--page-pad)] md:gap-5">
          <Link to="/" className="shrink-0 no-underline" aria-label="Naada home">
            <Wordmark className="text-[19px] md:text-[22px]" />
          </Link>

          {/* The search takes the middle and centres in it, so the brand sits at the
              left edge and the controls at the right edge, level with the strip below. */}
          <div className="hidden flex-1 justify-center md:flex">
            <SearchBox className="w-full max-w-3xl" />
          </div>
          <div className="flex-1 md:hidden" />

          <CityPicker compact />

          <button
            type="button"
            onClick={() => setLang(kn ? "en" : "kn")}
            aria-label="Change language"
            className="glass-soft hidden min-h-11 shrink-0 rounded-md px-3 text-[14px] font-semibold text-paper hover:border-paper/50 sm:block"
          >
            {kn ? "EN" : "ಕನ್ನಡ"}
          </button>

          <ThemeToggle theme={theme} setTheme={setTheme} className="hidden sm:grid" />

          {isLoggedIn ? (
            <div className="flex shrink-0 items-center gap-2">
              {role === "listener" && (
                <Link to="/tickets" className="hidden whitespace-nowrap text-[14px] font-semibold text-muted no-underline hover:text-paper md:block">
                  {kn ? "ನನ್ನ ಟಿಕೆಟ್‌ಗಳು" : "My tickets"}
                </Link>
              )}
              <NotificationBell />
              <AccountMenu />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => openAuth("Sign in to Naada", { onDone: afterSignIn })}
              className="min-h-11 shrink-0 whitespace-nowrap rounded-md bg-signal px-4 text-[14px] font-bold text-white hover:bg-[#d4503a] md:px-5 md:text-[15px]"
            >
              {kn ? "ಸೈನ್ ಇನ್" : "Sign in"}
            </button>
          )}
        </div>

        {/* Phone: search on its own row */}
        <div className="px-[var(--page-pad)] pb-3 md:hidden">
          <SearchBox />
        </div>

        {/* Row 2: sections */}
        <div className="border-t border-line">
          <nav
            aria-label="Sections"
            className="flex w-full items-center gap-1 overflow-x-auto px-[var(--page-pad)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {NAV_LINKS.map(({ label, labelKn, path, exact }) => {
              const active = isActive(path, exact);
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? "page" : undefined}
                  className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-semibold no-underline transition-colors ${
                    active ? "border-signal text-paper" : "border-transparent text-muted hover:text-paper"
                  }`}
                >
                  {kn ? labelKn : label}
                </Link>
              );
            })}
            <span className="flex-1" />
            {!isLoggedIn && (
              <button
                type="button"
                onClick={() => openAuth("Host your event on Naada", { preferRole: "host", onDone: afterSignIn })}
                className="hidden shrink-0 whitespace-nowrap px-3 py-3 text-[14px] font-semibold text-muted hover:text-paper md:block"
              >
                {kn ? "ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ ಆಯೋಜಿಸಿ" : "Host your event"}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="glass-soft mt-16 rounded-none border-x-0 border-b-0 bg-[var(--glass-bar)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-[var(--page-pad)] py-8">
          <Wordmark className="text-[19px]" />
          {/* Terms, Privacy, Refunds and Contact must be reachable from the
              site itself — a payment gateway's merchant review checks for them,
              and a buyer looking for a refund policy should not have to guess
              the URL. */}
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {[
              ...NAV_LINKS.slice(1),
              { label: "Terms", path: "/terms" },
              { label: "Privacy", path: "/privacy" },
              { label: "Refunds", path: "/refunds" },
              { label: "Contact", path: "/contact" },
            ].map(({ label, path }) => (
              <Link key={path} to={path} className="text-[13px] text-muted no-underline hover:text-paper">
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4">
            <p className="text-[13px] text-muted">Live art · Mysuru &amp; Bengaluru</p>
            <ThemeToggle theme={theme} setTheme={setTheme} className="sm:hidden" />
          </div>
        </div>
      </footer>
    </div>
  );
}
