import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  Compass,
  Flag,
  Gavel,
  Handshake,
  Inbox,
  Landmark,
  LayoutGrid,
  Menu,
  Mic2,
  Music4,
  ShieldCheck,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Wordmark } from "./wordmark";
import { NotificationBell } from "./notification-bell";
import { AccountMenu } from "./account-menu";
import { PageBackdrop } from "./page-backdrop";
import { ThemeToggle } from "./display-controls";
import { cn } from "@/lib/utils";

/**
 * Section 4 — console shell. 240px sidebar, icon rail below 1024, hamburger
 * below 720. Top bar carries the breadcrumb and the account menu.
 */

export interface NavItem {
  to: string;
  label: string;
  icon: keyof typeof ICONS;
  end?: boolean;
}

const ICONS = {
  overview: LayoutGrid,
  events: CalendarDays,
  artists: Users,
  bookings: Handshake,
  settlements: Wallet,
  offers: Inbox,
  gigs: Music4,
  profile: Mic2,
  verification: ShieldCheck,
  disputes: Gavel,
  flags: Flag,
  board: Compass,
  venue: Building2,
  business: Landmark,
};

export const HOST_NAV: NavItem[] = [
  { to: "/host", label: "Overview", icon: "overview", end: true },
  { to: "/host/venue", label: "Venue", icon: "venue" },
  { to: "/host/events", label: "Events", icon: "events" },
  { to: "/host/artists", label: "Artists", icon: "artists" },
  { to: "/host/bookings", label: "Bookings", icon: "bookings" },
  { to: "/host/settlements", label: "Settlements", icon: "settlements" },
  { to: "/host/business", label: "Business", icon: "business" },
];

export const ARTIST_NAV: NavItem[] = [
  { to: "/artist", label: "Overview", icon: "overview", end: true },
  { to: "/artist/gig-board", label: "Gig board", icon: "board" },
  { to: "/artist/offers", label: "Offers", icon: "offers" },
  { to: "/artist/gigs", label: "Gigs", icon: "gigs" },
  { to: "/artist/earnings", label: "Earnings", icon: "settlements" },
  { to: "/artist/profile", label: "Profile", icon: "profile" },
];

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Overview", icon: "overview", end: true },
  { to: "/admin/verification", label: "Verification", icon: "verification" },
  { to: "/admin/disputes", label: "Disputes", icon: "disputes" },
  { to: "/admin/ledger", label: "Ledger", icon: "settlements" },
  { to: "/admin/messages", label: "Flagged messages", icon: "flags" },
];

export function ConsoleShell({
  nav,
  breadcrumb,
  children,
  actions,
}: {
  nav: NavItem[];
  breadcrumb: string[];
  children: ReactNode;
  actions?: ReactNode;
}) {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => setMenuOpen(false), [location.pathname]);


  return (
    <div className="relative isolate min-h-dvh md:flex">
      <PageBackdrop />
      {/* Desktop sidebar / tablet icon rail */}
      <aside className="glass-soft sticky top-0 hidden h-dvh shrink-0 rounded-none border-y-0 border-l-0 bg-[var(--glass-bar)] md:block md:w-[72px] lg:w-[240px]">
        <div className="flex h-16 items-center border-b border-line px-4 lg:px-6">
          <Link to="/" aria-label="Naada home" className="flex items-center">
            <Wordmark className="hidden lg:inline" />
            <span
              className="font-display text-[20px] font-extrabold text-signal lg:hidden"
              aria-hidden="true"
            >
              N
            </span>
          </Link>
        </div>
        <nav className="flex flex-col gap-1 p-2 lg:p-3" aria-label="Console">
          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-2 border-t border-line p-2 lg:p-3">
          <Link
            to="/"
            className="flex min-h-11 items-center gap-3 px-3 text-[14px] text-muted transition-colors hover:text-paper"
          >
            <ChevronRight className="size-4 shrink-0 rotate-180" aria-hidden="true" />
            <span className="hidden lg:inline">Back to Discover</span>
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-[var(--glass-border-soft)] bg-[var(--glass-bar)] px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            className="grid size-11 shrink-0 place-items-center rounded-md border border-line md:hidden"
            aria-label="Open navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>

          <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
            <ol className="flex items-center gap-2 overflow-hidden">
              {breadcrumb.map((crumb, i) => (
                <li key={crumb} className="flex min-w-0 items-center gap-2">
                  {i > 0 && (
                    <ChevronRight className="size-3.5 shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <span
                    className={cn(
                      "truncate text-[14px]",
                      i === breadcrumb.length - 1 ? "text-paper" : "text-muted",
                    )}
                  >
                    {crumb}
                  </span>
                </li>
              ))}
            </ol>
          </nav>

          {actions}

          <ThemeToggle className="hidden sm:grid" />

          <NotificationBell />

          <AccountMenu />
        </header>

        <main className="mx-auto w-full max-w-[1360px] flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {menuOpen && (
          <div className="fixed inset-0 z-[80] md:hidden">
            <motion.div
              className="absolute inset-0 bg-black/70"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              onClick={() => setMenuOpen(false)}
              aria-hidden="true"
            />
            <motion.nav
              aria-label="Console"
              className="absolute inset-y-0 left-0 w-[260px] border-r border-line bg-[var(--menu-bg)] p-3 backdrop-blur-xl"
              initial={reduce ? { opacity: 0 } : { x: -260 }}
              animate={reduce ? { opacity: 1 } : { x: 0 }}
              exit={reduce ? { opacity: 0 } : { x: -260 }}
              transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="mb-3 flex h-12 items-center justify-between px-2">
                <Wordmark />
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close navigation"
                  className="grid size-11 place-items-center text-muted"
                >
                  <X className="size-5" aria-hidden="true" />
                </button>
              </div>
              {nav.map((item) => (
                <SidebarLink key={item.to} item={item} forceLabel />
              ))}
              <div className="mt-3 flex items-center justify-between border-t border-line px-3 pt-3">
                <span className="text-[13px] text-muted">Appearance</span>
                <ThemeToggle className="grid" />
              </div>
              <Link
                to="/"
                className="flex min-h-11 items-center gap-3 px-3 pt-2 text-[14px] text-muted"
              >
                Back to Discover
              </Link>
            </motion.nav>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarLink({ item, forceLabel }: { item: NavItem; forceLabel?: boolean }) {
  const Icon = ICONS[item.icon];
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={item.label}
      className={({ isActive }) =>
        cn(
          "relative flex min-h-11 items-center gap-3 px-3 text-[14px] transition-colors",
          forceLabel ? "" : "justify-center lg:justify-start",
          "rounded-md",
          isActive ? "bg-paper/10 text-paper" : "text-muted hover:bg-paper/5 hover:text-paper",
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-0 left-0 w-[2px]",
              isActive ? "bg-signal" : "bg-transparent",
            )}
          />
          <Icon className="size-4 shrink-0" aria-hidden="true" />
          <span className={forceLabel ? "" : "hidden lg:inline"}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}
