import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Turns a horizontally overflowing element into a rail that advances itself.
 *
 * The home page has several of these now (events this week, what's coming
 * later, artists, rooms) and the pause/reset/stop rules are identical for all
 * of them, so they live here once rather than four times.
 *
 * Returns the ref to put on the scrolling element, plus the handlers that
 * pause it. Pause on pointer *and* touch: a strip that keeps sliding out from
 * under a thumb is unusable on a phone, and `onTouchStart` without its
 * matching end/cancel leaves it paused forever after a single tap.
 *
 * @param resetKey  Changing it scrolls back to the start — pass a primitive
 *   fingerprint of the list (its joined ids), never the array itself. A fresh
 *   array reference arrives on plenty of renders that don't change what's in
 *   the rail, and an effect keyed on one tears itself down and rebuilds before
 *   its own interval ever fires.
 */
export function useAutoScroll(resetKey: string, stepPx = 320, everyMs = 3500) {
  const ref = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    ref.current?.scrollTo({ left: 0 });
  }, [resetKey]);

  useEffect(() => {
    if (reduceMotion || paused) return;
    const el = ref.current;
    // Nothing to scroll past — don't run a timer that can only ever no-op.
    if (!el || el.scrollWidth <= el.clientWidth + 4) return;

    const id = window.setInterval(() => {
      const nearEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
      el.scrollTo({ left: nearEnd ? 0 : el.scrollLeft + stepPx, behavior: "smooth" });
    }, everyMs);
    return () => window.clearInterval(id);
  }, [resetKey, reduceMotion, paused, stepPx, everyMs]);

  return {
    ref,
    handlers: {
      onMouseEnter: () => setPaused(true),
      onMouseLeave: () => setPaused(false),
      onTouchStart: () => setPaused(true),
      onTouchEnd: () => setPaused(false),
      onTouchCancel: () => setPaused(false),
    },
  };
}
