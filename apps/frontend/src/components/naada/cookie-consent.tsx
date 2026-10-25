import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { onOpenCookieSettings, setConsent, useConsent } from "@/lib/consent";

/**
 * Cookie notice and preferences.
 *
 * Honest by construction: the optional things are the language/theme preference and,
 * only when analytics is configured for the build, anonymous usage analytics. Both start
 * off, and "Reject optional" is a button of exactly the same size and weight as "Accept all" — no dark
 * patterns. Necessary storage is listed, not hidden behind a toggle that does
 * nothing.
 *
 * The banner never appears over the door scanner: someone checking in a queue
 * of guests must not have a notice sitting on the camera.
 */

const HIDE_ON = [/^\/host\/events\/[^/]+\/door$/, /^\/gate\/[^/]+\/door$/];

const NECESSARY = [
  { name: "Sign-in session", why: "Keeps you signed in and your account secure." },
  { name: "Door-scan queue", why: "Holds check-ins made while offline until they can be sent." },
  { name: "Unsaved floor-plan draft", why: "Stops a host losing work if the connection drops." },
  { name: "Your cookie choice", why: "Remembers this decision for 12 months so we don't keep asking." },
];

/** The analytics choice only exists when this build can actually send analytics. */
const ANALYTICS_AVAILABLE = Boolean(import.meta.env.VITE_ANALYTICS_KEY);

export function CookieConsent() {
  const consent = useConsent();
  const { pathname } = useLocation();
  const [panel, setPanel] = useState(false);
  const [prefs, setPrefs] = useState(false);
  const [stats, setStats] = useState(false);

  useEffect(() => onOpenCookieSettings(() => {
    setPrefs(consent?.preferences ?? false);
    setStats(consent?.analytics ?? false);
    setPanel(true);
  }), [consent]);

  const decide = (preferences: boolean, analytics = preferences) => {
    setConsent({ preferences, analytics: ANALYTICS_AVAILABLE && analytics });
    setPanel(false);
  };

  const showBanner = consent === null && !panel && !HIDE_ON.some((r) => r.test(pathname));

  return (
    <>
      {showBanner && (
        <section
          role="region"
          aria-label="Cookie notice"
          className="fixed inset-x-0 bottom-0 z-[400] border-t border-line bg-surface px-4 py-4 shadow-[0_-8px_30px_rgba(0,0,0,0.35)] sm:px-8"
        >
          <div className="mx-auto flex max-w-[1100px] flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="t-small max-w-[68ch] text-paper/90">
              <strong className="text-paper">Cookies, kept to a minimum.</strong> We use the storage the site
              needs to work. With your OK we'll also remember your language and theme
              {ANALYTICS_AVAILABLE ? " and count anonymous visits to improve the site" : ""}. No ads, no
              selling your data.{" "}
              <Link to="/cookies" className="link-underline text-paper">
                Cookie policy
              </Link>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => decide(false)}>Reject optional</Button>
              <Button onClick={() => { setPrefs(false); setStats(false); setPanel(true); }}>Choose</Button>
              <Button variant="primary" onClick={() => decide(true)}>Accept all</Button>
            </div>
          </div>
        </section>
      )}

      <Modal open={panel} onClose={() => setPanel(false)} title="Cookie preferences">
        <p className="t-small text-muted">
          Change this any time from <strong>Cookie settings</strong> in the footer.
        </p>

        <fieldset className="mt-4 border border-line p-4">
          <legend className="t-micro px-1 text-muted">Strictly necessary · always on</legend>
          <ul className="space-y-2.5">
            {NECESSARY.map((n) => (
              <li key={n.name} className="t-small">
                <span className="text-paper">{n.name}</span>
                <span className="block text-muted">{n.why}</span>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="mt-3 flex cursor-pointer items-start gap-3 border border-line p-4">
          <input
            type="checkbox"
            checked={prefs}
            onChange={(e) => setPrefs(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[#D4380D]"
          />
          <span className="t-small">
            <span className="text-paper">Preferences</span>
            <span className="block text-muted">
              Remember my language and light/dark theme next time. If off, they reset when you close the tab.
            </span>
          </span>
        </label>

        {ANALYTICS_AVAILABLE && (
          <label className="mt-3 flex cursor-pointer items-start gap-3 border border-line p-4">
            <input
              type="checkbox"
              checked={stats}
              onChange={(e) => setStats(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-[#D4380D]"
            />
            <span className="t-small">
              <span className="text-paper">Analytics</span>
              <span className="block text-muted">
                Anonymous page views and key actions, sent to PostHog, so we can see what to fix. No
                names, emails or phone numbers. If off, nothing is sent.
              </span>
            </span>
          </label>
        )}

        <p className="t-micro mt-3 text-muted">
          Showzy does not use advertising or social-media cookies.{" "}
          <Link to="/cookies" className="link-underline text-paper" onClick={() => setPanel(false)}>
            Read the cookie policy
          </Link>
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={() => decide(false)}>Reject optional</Button>
          <Button variant="primary" onClick={() => decide(prefs, stats)}>Save choices</Button>
        </div>
      </Modal>
    </>
  );
}
