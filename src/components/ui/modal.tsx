import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Hides the close affordance for flows that must be completed or cancelled explicitly. */
  hideClose?: boolean;
}

/**
 * The one place the brief allows a box shadow. Traps focus, closes on Escape,
 * and restores focus to whatever opened it.
 */
export function Modal({ open, onClose, title, children, className, hideClose }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    const timer = window.setTimeout(() => {
      const first = focusables()[0] ?? panelRef.current;
      first?.focus();
    }, 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center overflow-y-auto p-0 md:items-center md:p-6">
          <motion.div
            className="fixed inset-0 bg-black/72 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.99 }}
            transition={{ duration: reduce ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative z-10 w-full max-w-[460px] border border-line bg-surface",
              "rounded-t-[4px] md:rounded-[4px]",
              "shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75)]",
              className,
            )}
          >
            {(title || !hideClose) && (
              <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
                {title ? <h2 className="t-h2 pt-0.5">{title}</h2> : <span />}
                {!hideClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="-mr-2 -mt-1 grid size-11 place-items-center text-muted transition-colors hover:text-paper"
                  >
                    <X className="size-5" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
