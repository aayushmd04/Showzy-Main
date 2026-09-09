import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

const TONE_CLASS = {
  default: "border-line text-paper",
  success: "border-live text-live",
  fault: "border-fault text-fault",
};

export function Toaster() {
  const { toasts, dismissToast } = useStore();
  const reduce = useReducedMotion();

  return (
    <div
      className="pointer-events-none fixed inset-x-4 bottom-24 z-[95] flex flex-col items-center gap-2 md:inset-x-0 md:bottom-8"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            layout
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "pointer-events-auto max-w-[calc(100vw-32px)] border bg-surface-2 px-4 py-3 text-left text-[13px]",
              "shadow-[0_12px_36px_-12px_rgba(0,0,0,0.8)]",
              TONE_CLASS[t.tone],
            )}
          >
            {t.message}
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
