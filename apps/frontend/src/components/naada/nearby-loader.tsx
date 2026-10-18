/**
 * A short full-screen "Finding events near you" screen with a fun fact.
 *
 * It lives at the top of the app, not inside the page that started it, so it
 * can stay up while that page hands over to the next one and then fade away
 * over the new page. Anything can start it with `runNearbyLoader()`; it shows
 * for at least three seconds, asks the browser for the visitor's location in
 * the meantime, and resolves with the answer. The caller decides where to go
 * and then calls `hideNearbyLoader()`.
 */
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { randomFact, type FunFact } from "@/data/fun-facts";
import { locateCity, type LocateResult } from "@/lib/nearby";

/** Time for the title and the fact to arrive, before any reading starts. */
const LEAD_IN_MS = 1000;
/** About 315 words a minute: brisk, but a fact can still be read start to finish. */
const MS_PER_WORD = 190;

/** Long enough to read this fact, never so long that it drags. */
function showFor(fact: FunFact): number {
  const words = fact.text.trim().split(/\s+/).length;
  return Math.min(6000, Math.max(3800, LEAD_IN_MS + words * MS_PER_WORD));
}

interface ShowDetail {
  fact: FunFact;
  ms: number;
  /** Heading. Defaults to the location wording. */
  title?: string;
}
const SHOW = "naada:loader-show";
const HIDE = "naada:loader-hide";
/** Starts the finish: the camera dives into the red dot, then the screen hands over to the page. */
const ZOOM = "showzy:loader-zoom";
/** How long the dive into the dot takes. */
const ZOOM_MS = 900;
/** Width of the red dot in the logo symbol, in px, at the size it is drawn (16/100 of 96px, doubled). */
const DOT_PX = 30.72;

export async function runNearbyLoader(): Promise<LocateResult> {
  const fact = randomFact();
  const ms = showFor(fact);
  window.dispatchEvent(new CustomEvent<ShowDetail>(SHOW, { detail: { fact, ms } }));
  const [result] = await Promise.all([locateCity(), new Promise((r) => setTimeout(r, ms))]);
  return result;
}

const SEEN_KEY = "showzy_splash_seen";
/** The opening screen holds for this long before the dive into the dot. */
const STARTUP_HOLD_MS = 3800;
/** Only facts this short are used on it, so they can be read in that time. */
const STARTUP_MAX_WORDS = 18;

/** True from the moment the opening screen is requested until it is hidden. */
let startupScreenUp = false;

/**
 * The page has been held hidden (class `bloom-wait`, set in index.html) behind the loading
 * screen. Letting go of it makes the page bloom in: it eases from soft and slightly small to
 * sharp, with a warm glow that fades. Visitors who prefer reduced motion just get the page.
 */
function bloomIn() {
  const root = document.documentElement;
  if (!root.classList.contains("bloom-wait")) return;
  root.classList.remove("bloom-wait");
  window.dispatchEvent(new CustomEvent("showzy:bloom"));
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.add("bloom-run");
  window.setTimeout(() => root.classList.remove("bloom-run"), 1800);
}
/**
 * The screen shown when the site is opened: the first visit of a session, and only
 * on the home page (a shared link to one event goes straight to that event). It
 * says what it is doing, which is loading, not locating.
 */
export function showStartupLoader() {
  try {
    if (sessionStorage.getItem(SEEN_KEY)) {
      // Already shown this visit. If it is on screen right now (a repeated start), leave the
      // bloom to its end; otherwise there is nothing to wait for.
      if (!startupScreenUp) bloomIn();
      return;
    }
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* no storage: show it, once per page load */
  }
  const path = window.location.pathname;
  if (path !== "/" && path !== "/whats-on") {
    bloomIn();
    return;
  }
  const fact = randomFact(STARTUP_MAX_WORDS);
  const ms = STARTUP_HOLD_MS;
  startupScreenUp = true;
  window.dispatchEvent(
    new CustomEvent<ShowDetail>(SHOW, { detail: { fact, ms, title: "Getting Showzy ready" } }),
  );
  // Instead of cutting away, finish with the dive into the dot.
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(ZOOM)), ms);
}

export function hideNearbyLoader() {
  window.dispatchEvent(new CustomEvent(HIDE));
}

export function NearbyLoader() {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [fact, setFact] = useState<FunFact>(() => randomFact());
  const [ms, setMs] = useState(5000);
  const [run, setRun] = useState(0);
  const [title, setTitle] = useState("Finding events near you");
  const [phase, setPhase] = useState<"loading" | "zoom">("loading");
  // Big enough that the dot, grown, covers the whole screen from wherever it sits.
  const reach = typeof window === "undefined" ? 2000 : Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));

  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<ShowDetail>).detail;
      setFact(d.fact);
      setMs(d.ms);
      setTitle(d.title ?? "Finding events near you");
      setPhase("loading");
      setRun((n) => n + 1);
      setOpen(true);
    };
    const hide = () => {
      startupScreenUp = false;
      setOpen(false);
      bloomIn();
    };
    window.addEventListener(SHOW, show);
    let zoomTimer: number | undefined;
    const zoom = () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        hide();
        return;
      }
      setPhase("zoom");
      zoomTimer = window.setTimeout(hide, ZOOM_MS);
    };
    window.addEventListener(HIDE, hide);
    window.addEventListener(ZOOM, zoom);
    showStartupLoader();
    return () => {
      window.removeEventListener(ZOOM, zoom);
      window.clearTimeout(zoomTimer);
      window.removeEventListener(SHOW, show);
      window.removeEventListener(HIDE, hide);
    };
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="nearby-loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : phase === "zoom" ? 0.8 : 0.45, ease: "easeInOut" }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-ink px-6 text-center font-support text-paper"
        >
          <motion.div
            key={run}
            initial={reduce ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="relative grid size-24 place-items-center"
            aria-hidden
          >
            {/* The logo's symbol bounces while it loads; the segmented ring turns around the red dot. */}
            {phase === "loading" && (
              <span
                aria-hidden
                className="absolute -bottom-4 left-1/2 h-2 w-14 -translate-x-1/2 rounded-full bg-paper/20 animate-[showzy-shadow_1.2s_ease-in-out_infinite] motion-reduce:animate-none"
              />
            )}
            <div
              className={
                phase === "loading" ? "animate-[showzy-bounce_1.2s_ease-in-out_infinite] motion-reduce:animate-none" : ""
              }
            >
            <svg viewBox="0 0 100 100" className="size-24 overflow-visible">
              <g
                style={{ transformOrigin: "50px 50px" }}
                className="animate-[showzy-spin_2.4s_linear_infinite] motion-reduce:animate-none"
              >
                <path
                  style={{ opacity: phase === "zoom" ? 0 : 1, transition: "opacity 0.35s ease" }}
                  d="M47.57 80.9A31 31 0 0 1 47.57 19.1M52.43 19.1A31 31 0 0 1 63.35 22.02M67.56 24.45A31 31 0 0 1 75.55 32.44M77.98 36.65A31 31 0 0 1 80.9 47.57M80.9 52.43A31 31 0 0 1 77.98 63.35M75.55 67.56A31 31 0 0 1 67.56 75.55M63.35 77.98A31 31 0 0 1 52.43 80.9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="14"
                />
              </g>
              <circle cx="50" cy="50" r="16" fill="#C4472E" />
            </svg>
            </div>
            {/* The finish: the red dot swells until it fills the screen, then the page blooms in. */}
            {phase === "zoom" && !reduce && (
              <motion.span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 z-10 rounded-full bg-signal"
                style={{ width: reach * 2, height: reach * 2, marginLeft: -reach, marginTop: -reach }}
                initial={{ scale: DOT_PX / (reach * 2) }}
                animate={{ scale: 1 }}
                transition={{ duration: (ZOOM_MS - 50) / 1000, ease: [0.7, 0, 0.3, 1] }}
              />
            )}
          </motion.div>

          <div className={`flex flex-col items-center transition-opacity duration-300 ${phase === "zoom" ? "opacity-0" : ""}`}>

          <h2
            role="status"
            className="mt-8 font-megrim text-[clamp(26px,6vw,44px)] font-normal uppercase leading-tight tracking-[0.02em]"
          >
            {title}
            {!reduce && (
              <span aria-hidden className="inline-flex w-8 justify-start">
                <motion.span animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>
                  …
                </motion.span>
              </span>
            )}
          </h2>

          {/* Fact arrives after the heading has had a moment */}
          <motion.div
            key={`fact-${run}`}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: reduce ? 0 : 0.3, ease: "easeOut" }}
            className="mt-10 max-w-md"
            aria-live="polite"
          >
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-gold">
              Did you know? · {fact.kind}
            </p>
            <p className="mt-3 text-[18px] leading-relaxed text-paper/90 md:text-[20px]">{fact.text}</p>
          </motion.div>

          <div className="mt-12 h-[3px] w-48 overflow-hidden rounded-full bg-paper/15" aria-hidden>
            <motion.div
              key={`bar-${run}`}
              initial={{ scaleX: reduce ? 1 : 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: reduce ? 0 : ms / 1000, ease: "linear" }}
              style={{ transformOrigin: "left" }}
              className="h-full bg-signal"
            />
          </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
