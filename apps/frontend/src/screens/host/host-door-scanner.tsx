import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useStore } from "@/store/app-store";
import { cn } from "@/lib/utils";
import { NotFoundScreen } from "../not-found";

/**
 * Section 7.14 — full screen, no shell. This runs on a borrowed phone at a
 * dark door, so everything is huge. The camera is simulated; nothing here
 * touches getUserMedia.
 */

type Overlay =
  | { kind: "valid"; name: string; tier: string; code: string }
  | { kind: "duplicate"; code: string; at: string }
  | { kind: "invalid"; code: string }
  | null;

export function HostDoorScannerScreen() {
  const { id = "" } = useParams();
  const { eventById, tickets, capacityOf, checkIn, toast } = useStore();
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [offline, setOffline] = useState(false);
  const [search, setSearch] = useState("");
  const timerRef = useRef<number | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const event = eventById(id);
  if (!event) return <NotFoundScreen />;

  const capacity = capacityOf(event);
  const eventTickets = tickets.filter((t) => t.eventId === event.id);

  const show = (next: Overlay) => {
    setOverlay(next);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setOverlay(null), 1500);
  };

  const scan = (code: string) => {
    const result = checkIn(event.id, code);
    const ticket = eventTickets.find((t) => t.code === code);
    if (result === "ok" && ticket) {
      show({ kind: "valid", name: ticket.holder, tier: ticket.tier, code: ticket.code });
    } else if (result === "duplicate" && ticket) {
      show({ kind: "duplicate", code: ticket.code, at: ticket.checkedInAt ?? "20:14" });
    } else {
      show({ kind: "invalid", code });
    }
  };

  const simulateValid = () => {
    const next = eventTickets.find((t) => t.status === "valid");
    if (next) {
      scan(next.code);
    } else {
      // No unscanned fixture ticket left — still demo the success state.
      show({ kind: "valid", name: "Walk-up guest", tier: event.tiers[0].name, code: "NAADA-WALK-UP01" });
      toast("No unscanned tickets left — showing the success state only");
    }
  };

  const simulateDuplicate = () => {
    const used = eventTickets.find((t) => t.status === "checked_in");
    show({
      kind: "duplicate",
      code: used?.code ?? "NAADA-7K2M-QX91",
      at: used?.checkedInAt ?? "20:14",
    });
  };

  const matches = search.trim()
    ? eventTickets.filter((t) =>
        `${t.holder} ${t.code}`.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : [];

  return (
    <div className="relative min-h-dvh bg-ink">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <Link
          to={`/host/events/${event.id}`}
          className="flex min-h-11 items-center gap-2 text-[15px] text-muted transition-colors hover:text-paper"
        >
          <ArrowLeft className="size-5" aria-hidden="true" />
          <span className="max-w-[45vw] truncate">{event.name}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOffline((v) => !v)}
          aria-pressed={offline}
          className={cn(
            "flex min-h-11 items-center gap-2 border px-3 font-mono text-[12px] uppercase tracking-[0.08em]",
            offline ? "border-brass text-brass" : "border-line text-muted",
          )}
        >
          <span aria-hidden="true">●</span>
          {offline ? "Offline" : "Online"}
        </button>
      </div>

      <div className="mx-auto w-full max-w-[560px] px-4 py-6">
        <p className="text-center font-mono text-[clamp(28px,9vw,44px)] font-medium leading-none">
          {event.checkedIn} / {capacity}
        </p>
        <p className="t-micro mt-2 text-center">checked in</p>
        {offline && (
          <p className="t-small mt-2 text-center text-brass">Queued locally · will sync</p>
        )}

        {/* Simulated viewfinder */}
        <div className="relative mt-6 aspect-[4/3] overflow-hidden border border-line bg-black">
          <div className="absolute inset-0 scanline opacity-40" aria-hidden="true" />
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-[2px] bg-signal/80"
            style={{
              animation: reduce ? undefined : "naada-scan 2.4s ease-in-out infinite",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2"
          >
            {["left-0 top-0 border-l-2 border-t-2", "right-0 top-0 border-r-2 border-t-2", "left-0 bottom-0 border-b-2 border-l-2", "right-0 bottom-0 border-b-2 border-r-2"].map(
              (pos) => (
                <span key={pos} className={cn("absolute size-8 border-paper/70", pos)} />
              ),
            )}
          </div>
          <p className="absolute inset-x-0 bottom-3 text-center font-mono text-[12px] uppercase tracking-[0.08em] text-paper/50">
            camera simulated
          </p>
        </div>

        {/* Search fallback — a keyboard alternative to scanning */}
        <div className="mt-5">
          <label htmlFor="door-search" className="sr-only">
            Search by name or phone
          </label>
          <Input
            id="door-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or phone"
            className="h-14 text-[16px]"
          />
          {matches.length > 0 && (
            <ul className="mt-2 divide-y divide-line border border-line bg-surface">
              {matches.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      scan(t.code);
                      setSearch("");
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[16px]">{t.holder}</span>
                      <span className="t-mono block truncate text-[12px] text-muted">{t.code}</span>
                    </span>
                    <span className="t-mono shrink-0 text-[12px] uppercase text-muted">
                      {t.status === "checked_in" ? "in" : t.tier}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8 grid gap-2 border-t border-dashed border-line pt-5 sm:grid-cols-3">
          <Button onClick={simulateValid}>Simulate valid scan</Button>
          <Button onClick={simulateDuplicate}>Simulate duplicate</Button>
          <Button onClick={() => show({ kind: "invalid", code: "NAADA-XXXX-0000" })}>
            Simulate invalid
          </Button>
        </div>
      </div>

      {/* Full-screen result overlays */}
      <AnimatePresence>
        {overlay && (
          <motion.div
            key="scan-overlay"
            role="alert"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.02 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.14 }}
            className={cn(
              "fixed inset-0 z-[120] flex flex-col items-center justify-center px-6 text-center",
              overlay.kind === "valid" ? "bg-live text-ink" : "bg-fault text-ink",
            )}
          >
            {overlay.kind === "valid" ? (
              <>
                <Check className="size-24" strokeWidth={3} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(26px,8vw,44px)] font-extrabold uppercase leading-none">
                  {overlay.name}
                </p>
                <p className="mt-3 text-[18px]">{overlay.tier}</p>
                <p className="mt-1 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
                <p className="mt-8 font-mono text-[26px] font-medium">
                  {event.checkedIn} / {capacity}
                </p>
              </>
            ) : (
              <>
                <X className="size-24" strokeWidth={3} aria-hidden="true" />
                <p className="mt-6 font-display text-[clamp(24px,7vw,40px)] font-extrabold uppercase leading-none">
                  {overlay.kind === "duplicate" ? "Already checked in" : "Not a valid ticket"}
                </p>
                <p className="mt-3 font-mono text-[15px] tracking-[0.1em]">{overlay.code}</p>
                {overlay.kind === "duplicate" && (
                  <p className="mt-1 text-[17px]">Scanned at {overlay.at}</p>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
