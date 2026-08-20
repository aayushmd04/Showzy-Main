import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import type { Role } from "@/data/fixtures";
import { useStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

/**
 * Section 7.20. The single most important prototype affordance — without it
 * nothing is demoable. Deliberately looks like a debug tool: dashed border,
 * mono type, semi-transparent until hovered.
 */

const ROLES: { value: Role; label: string; who: string; home: string }[] = [
  { value: "out", label: "Logged out", who: "", home: "/" },
  { value: "listener", label: "Listener", who: "Meera", home: "/tickets" },
  { value: "artist", label: "Artist", who: "Rohan", home: "/artist" },
  { value: "host", label: "Host", who: "Sonal", home: "/host" },
];

export function DevSwitcher() {
  const { role, setRole, emptyLists, setEmptyLists } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const reduce = useReducedMotion();

  const switchTo = (next: Role) => {
    setRole(next);
    const consoleRoute =
      location.pathname.startsWith("/host") ||
      location.pathname.startsWith("/artist") ||
      location.pathname.startsWith("/bookings");
    if (consoleRoute || next === "out") {
      navigate(ROLES.find((r) => r.value === next)?.home ?? "/");
    }
  };

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="fixed bottom-4 right-4 z-[100] border border-dashed border-line bg-ink/90 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted backdrop-blur transition-opacity hover:text-paper"
      >
        DEV
      </button>
    );
  }

  return (
    <motion.aside
      aria-label="Prototype role switcher"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: reduce ? 0 : 0.3 }}
      className="fixed bottom-4 right-4 z-[100] w-[188px] border border-dashed border-line bg-ink/90 p-2 opacity-60 backdrop-blur transition-opacity duration-200 hover:opacity-100 focus-within:opacity-100"
    >
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">DEV</span>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="font-mono text-[11px] text-muted hover:text-paper"
          aria-label="Hide the role switcher"
        >
          ×
        </button>
      </div>

      <div role="radiogroup" aria-label="View as">
        {ROLES.map((r) => {
          const active = role === r.value;
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => switchTo(r.value)}
              className={cn(
                "flex w-full items-center gap-2 px-1 py-1.5 text-left font-mono text-[11px] transition-colors",
                active ? "text-paper" : "text-muted hover:text-paper",
              )}
            >
              <span aria-hidden="true" className={active ? "text-signal" : ""}>
                {active ? "●" : "○"}
              </span>
              <span className="flex-1">{r.label}</span>
              <span className="text-muted">{r.who}</span>
            </button>
          );
        })}
      </div>

      <label className="mt-1 flex cursor-pointer items-center gap-2 border-t border-dashed border-line px-1 pt-2 font-mono text-[11px] text-muted hover:text-paper">
        <input
          type="checkbox"
          checked={emptyLists}
          onChange={(e) => setEmptyLists(e.target.checked)}
          className="size-3 accent-[#FF3D6E]"
        />
        empty lists
      </label>
    </motion.aside>
  );
}
