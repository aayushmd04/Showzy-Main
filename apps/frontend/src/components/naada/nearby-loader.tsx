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
import { MapPin } from "lucide-react";

import { randomFact, type FunFact } from "@/data/fun-facts";
import { locateCity, type LocateResult } from "@/lib/nearby";

/** Time for the title and the fact to arrive, before any reading starts. */
const LEAD_IN_MS = 1200;
/** About 260 words a minute, so a fact can be read start to finish. */
const MS_PER_WORD = 230;

/** Long enough to read this fact, never so long that it drags. */
function showFor(fact: FunFact): number {
  const words = fact.text.trim().split(/\s+/).length;
  return Math.min(7500, Math.max(5000, LEAD_IN_MS + words * MS_PER_WORD));
}

interface ShowDetail {
  fact: FunFact;
  ms: number;
}
const SHOW = "naada:loader-show";
const HIDE = "naada:loader-hide";

export async function runNearbyLoader(): Promise<LocateResult> {
  const fact = randomFact();
  const ms = showFor(fact);
  window.dispatchEvent(new CustomEvent<ShowDetail>(SHOW, { detail: { fact, ms } }));
  const [result] = await Promise.all([locateCity(), new Promise((r) => setTimeout(r, ms))]);
  return result;
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

  useEffect(() => {
    const show = (e: Event) => {
      const d = (e as CustomEvent<ShowDetail>).detail;
      setFact(d.fact);
      setMs(d.ms);
      setRun((n) => n + 1);
      setOpen(true);
    };
    const hide = () => setOpen(false);
    window.addEventListener(SHOW, show);
    window.addEventListener(HIDE, hide);
    return () => {
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
          transition={{ duration: reduce ? 0 : 0.45, ease: "easeInOut" }}
          className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-ink px-6 text-center font-support text-paper"
        >
          <motion.div
            key={run}
            initial={reduce ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6 }}
            className="relative grid size-20 place-items-center"
            aria-hidden
          >
            {!reduce && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-signal/30" />
                <span className="absolute inset-2 animate-ping rounded-full bg-signal/20 [animation-delay:.4s]" />
              </>
            )}
            <span className="relative grid size-14 place-items-center rounded-full bg-signal text-white">
              <MapPin className="size-7" />
            </span>
          </motion.div>

          <h2
            role="status"
            className="mt-8 font-megrim text-[clamp(26px,6vw,44px)] font-normal uppercase leading-tight tracking-[0.02em]"
          >
            Finding events near you
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
            transition={{ duration: 0.7, delay: reduce ? 0 : 0.5, ease: "easeOut" }}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
