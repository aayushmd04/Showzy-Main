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
import { Search } from "lucide-react";

import { Wordmark } from "@/components/naada/wordmark";
import { CityPicker } from "@/components/naada/city-picker";
import { PageBackdrop } from "@/components/naada/page-backdrop";
import { LanguageToggle, ThemeToggle } from "@/components/naada/display-controls";
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

/** What the strip under the logo links to, by who is looking. */
const ARTIST_NAV = [
  { label: "Home", labelKn: "ಮುಖಪುಟ", path: "/", exact: true },
  { label: "Gig board", labelKn: "ಗಿಗ್ ಬೋರ್ಡ್", path: "/artist/gig-board" },
  { label: "Offers", labelKn: "ಆಫರ್‌ಗಳು", path: "/artist/offers" },
  { label: "My gigs", labelKn: "ನನ್ನ ಗಿಗ್‌ಗಳು", path: "/artist/gigs" },
  { label: "Earnings", labelKn: "ಗಳಿಕೆ", path: "/artist/earnings" },
  { label: "What's on", labelKn: "ಏನಿದೆ", path: "/whats-on", exact: true },
];

const HOST_NAV = [
  { label: "Home", labelKn: "ಮುಖಪುಟ", path: "/", exact: true },
  { label: "Events", labelKn: "ಕಾರ್ಯಕ್ರಮಗಳು", path: "/host/events" },
  { label: "Bookings", labelKn: "ಬುಕಿಂಗ್‌ಗಳು", path: "/host/bookings" },
  { label: "Find artists", labelKn: "ಕಲಾವಿದರನ್ನು ಹುಡುಕಿ", path: "/host/artists" },
  { label: "Settlements", labelKn: "ಪಾವತಿಗಳು", path: "/host/settlements" },
  { label: "What's on", labelKn: "ಏನಿದೆ", path: "/whats-on", exact: true },
];

function SearchBox({ className = "", boxed = false }: { className?: string; boxed?: boolean }) {
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
      <Search
        aria-hidden
        className={`pointer-events-none absolute top-1/2 size-[17px] -translate-y-1/2 text-muted ${boxed ? "left-3.5" : "left-0"}`}
      />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={
          boxed
            ? "h-11 w-full rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] pl-10 pr-3 text-[15px] text-paper placeholder:text-muted focus:border-signal focus:outline-none"
            : "h-10 w-full rounded-none border-0 border-b border-[var(--field-border)] bg-transparent pl-7 pr-2 text-[14px] text-paper placeholder:text-muted transition-colors focus:border-signal focus:outline-none"
        }
      />
    </form>
  );
}

export function PublicShell({ children }: { children: ReactNode }) {
  const { role, currentUser, lang } = useStore();
  const { open: openAuth } = useAuthSheet();
  const navigate = useNavigate();
  const location = useLocation();
  const kn = lang === "kn";

  const isLoggedIn = role !== "out" && currentUser !== null;
  const navLinks = isLoggedIn && role === "artist" ? ARTIST_NAV : isLoggedIn && role === "host" ? HOST_NAV : NAV_LINKS;
  const isActive = (path: string, exact?: boolean) => {
    if (!exact) return location.pathname.startsWith(path);
    // For an audience member, "What's on" is also what "/" shows.
    if (navLinks === NAV_LINKS && path === "/whats-on") return location.pathname === "/" || location.pathname === "/whats-on";
    return location.pathname === path;
  };

  const afterSignIn = (_outcome: unknown, nextRole: string) => {
    if (nextRole === "host") navigate("/host");
    else if (nextRole === "artist") navigate("/artist");
  };

  return (
    <div className="relative isolate flex min-h-dvh flex-col font-sans text-paper">
      <PageBackdrop />
      <header className="sticky top-0 z-40 border-b border-[var(--glass-border-soft)] bg-[var(--glass-bar)] backdrop-blur-xl">
        {/* One bar on a laptop; on a phone the brand and sign-in stay on top, then
            search, then the section links. One nav element, placed by `order`. */}
        <div className="flex w-full flex-wrap items-center px-[var(--page-pad)] lg:flex-nowrap lg:gap-10">
          <Link to="/" className="order-1 flex h-16 shrink-0 items-center no-underline" aria-label="Showzy home">
            <Wordmark />
          </Link>

          <div className="order-2 ml-8 hidden h-16 min-w-0 flex-1 items-center md:flex lg:order-3 lg:ml-0">
            <SearchBox className="w-full max-w-2xl" />
          </div>

          <div className="order-3 ml-auto flex h-16 shrink-0 items-center gap-3 md:gap-4 lg:order-4">
            <CityPicker plain />
            <span aria-hidden className="hidden h-4 w-px bg-[var(--color-line)] sm:block" />
            <LanguageToggle className="hidden sm:block" />
            <ThemeToggle className="hidden sm:grid" />

            {isLoggedIn ? (
              <div className="flex shrink-0 items-center gap-2">
                {role === "listener" && (
                  <Link to="/tickets" className="hidden whitespace-nowrap text-[13px] font-semibold text-muted no-underline hover:text-paper md:block">
                    {kn ? "ನನ್ನ ಟಿಕೆಟ್‌ಗಳು" : "My tickets"}
                  </Link>
                )}
                <NotificationBell />
                <AccountMenu />
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => openAuth("Host your event on Showzy", { preferRole: "host", onDone: afterSignIn })}
                  className="hidden whitespace-nowrap text-[13px] font-semibold text-muted hover:text-paper xl:block"
                >
                  {kn ? "ನಿಮ್ಮ ಕಾರ್ಯಕ್ರಮ ಆಯೋಜಿಸಿ" : "Host your event"}
                </button>
                <button
                  type="button"
                  onClick={() => openAuth("Sign in to Showzy", { onDone: afterSignIn })}
                  className="min-h-10 shrink-0 whitespace-nowrap rounded-md bg-signal px-4 text-[14px] font-bold text-white hover:bg-[#d4503a]"
                >
                  {kn ? "ಸೈನ್ ಇನ್" : "Sign in"}
                </button>
              </>
            )}
          </div>

          <div className="order-4 basis-full pb-3 md:hidden">
            <SearchBox boxed />
          </div>

          <nav
            aria-label="Sections"
            className="order-5 -mx-[var(--page-pad)] flex basis-full items-center gap-3 overflow-x-auto border-t sm:gap-7 border-[var(--color-line)] px-[var(--page-pad)] [scrollbar-width:none] lg:order-2 lg:mx-0 lg:basis-auto lg:border-t-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {navLinks.map(({ label, labelKn, path, exact }) => {
              const active = isActive(path, exact);
              return (
                <Link
                  key={path}
                  to={path}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex h-11 shrink-0 items-center whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.1em] no-underline sm:text-[12px] sm:tracking-[0.12em] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-signal after:opacity-0 aria-[current=page]:after:opacity-100 lg:h-16 ${
                    active ? "text-paper" : "text-muted hover:text-paper"
                  }`}
                >
                  {kn ? labelKn : label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="glass-soft mt-16 rounded-none border-x-0 border-b-0 bg-[var(--glass-bar)]">
        <div className="flex w-full flex-wrap items-center justify-between gap-4 px-[var(--page-pad)] py-8">
          <Wordmark />
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
            <ThemeToggle className="sm:hidden" />
          </div>
        </div>
      </footer>
    </div>
  );
}
