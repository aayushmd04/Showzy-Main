import { Link } from "react-router-dom";
import type { users as Users } from "@/data/fixtures";

/**
 * Top bar for the letterpress host home. The rest of the host console still
 * runs the dark console shell, so this deliberately carries its own nav rather
 * than embedding a themed sidebar — the links hand off to the existing routes.
 *
 * Styles live in the `.lp` stylesheet on the screen that renders this.
 */

const LINKS = [
  { to: "/host/events", label: "Events" },
  { to: "/host/artists", label: "Artists" },
  { to: "/host/bookings", label: "Bookings" },
  { to: "/host/settlements", label: "Settlements" },
];

export function ConsoleShellFree({ host }: { host: (typeof Users)["host"] }) {
  return (
    <header className="lp-top">
      <div className="lp-wrap lp-top-inner">
        <Link to="/" className="lp-wordmark" aria-label="Showzy home">
          Showzy
        </Link>

        <nav className="lp-nav" aria-label="Host">
          {LINKS.map((link) => (
            <Link key={link.to} to={link.to}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="lp-who">
          <span className="lp-who-name">{host.name}</span>
          <span className="lp-who-venue">{host.org}, Indiranagar</span>
        </div>
      </div>
    </header>
  );
}
