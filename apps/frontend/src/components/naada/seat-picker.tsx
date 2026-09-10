import { useCallback, useEffect, useState } from "react";
import { Loader2, MapPin, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEventZones } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * The buyer's half of the venue layout designer.
 *
 * A host draws their room in the host console — a stage, some tables, a VIP
 * section — and gives each area a capacity. Until now none of that ever
 * reached the person buying a ticket, who could pick a price and nothing else.
 * This renders that same plan read-only and lets them claim one area of it.
 *
 * Two rules shape everything here:
 *
 *  1. **Zones, not chairs.** The designer produces labelled areas with a
 *     capacity each, so "that table by the stage" is answerable and "seat 4B"
 *     is not. Claiming a table means claiming places at it, not a numbered
 *     seat.
 *  2. **Always optional.** Most open mics are standing room with no plan at
 *     all. When the venue has no layout this renders nothing and checkout is
 *     exactly what it was.
 *
 * The floor plan is a picture, and a picture is not an interface on a phone at
 * a bus stop. So the plan is a pointer shortcut and the real control is the
 * radio list underneath it — one tab stop, arrow keys between options, and
 * every number that matters written out in words.
 */

export interface VenueZone {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  capacity: number;
  bookable: boolean;
  taken: number;
  available: number;
}

export interface ZonesResponse {
  event_id: string;
  venue_name: string;
  has_layout: boolean;
  bookable_count: number;
  places_available: number;
  zones: VenueZone[];
}

export interface SeatPickerProps {
  eventId: string;
  /** How many places the order needs — a zone with fewer is not offered. */
  quantity: number;
  /** The chosen zone, or null for "no preference". */
  value: VenueZone | null;
  onChange: (zone: VenueZone | null) => void;
  /** Locks the choice once inventory has been held against it. */
  disabled?: boolean;
  /** Bump to re-read availability, e.g. after the server refuses a zone. */
  refreshToken?: number;
}

type Phase = "loading" | "ready" | "error";

/**
 * Server events are UUIDs. The app also carries fixture events whose ids are
 * short strings ("e2") and which exist nowhere server-side, so asking about
 * their floor plan is a request that can only ever 404.
 */
const SERVER_EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads a venue's floor plan and its live availability for one event.
 *
 * Deliberately not routed through the shared API client: this endpoint is
 * public and additive, and the client has no helper for it yet. Any failure is
 * reported as an error the caller can shrug off — nobody must ever be blocked
 * from paying because a floor plan would not load.
 */
export function useVenueZones(eventId: string, refreshToken = 0) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<ZonesResponse | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;

    // Nothing to ask about: no seating plan can exist for an event the
    // server has never heard of. Settled, not failed — there is nothing to
    // retry and nothing to apologise for.
    if (!SERVER_EVENT_ID.test(eventId)) {
      setData(null);
      setPhase("ready");
      return;
    }

    setPhase("loading");
    // Through the shared client, so this inherits its error handling and the
    // single base-URL configuration rather than reaching past it.
    getEventZones(eventId)
      .then((body) => {
        if (!alive) return;
        setData(body);
        setPhase("ready");
      })
      .catch(() => {
        if (!alive) return;
        setData(null);
        setPhase("error");
      });

    return () => {
      alive = false;
    };
  }, [eventId, attempt, refreshToken]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { phase, data, retry };
}

/** Areas that describe the room rather than offer a seat in it. */
const STRUCTURAL_TONE: Record<string, string> = {
  stage: "text-gold",
  entrance: "text-live",
  exit: "text-fault",
  bar: "text-muted",
};

function fill(zone: VenueZone) {
  if (!zone.capacity) return 0;
  return Math.min(1, zone.taken / zone.capacity);
}

/** What a buyer needs to know about a zone, in the order they need it. */
function availability(zone: VenueZone, quantity: number) {
  if (zone.available === 0) {
    return { tone: "text-muted", short: "Full", full: "Fully booked", pickable: false };
  }
  if (zone.available < quantity) {
    return {
      tone: "text-muted",
      short: `${zone.available} left`,
      full: `Only room for ${zone.available} — you're booking ${quantity}`,
      pickable: false,
    };
  }
  if (fill(zone) >= 0.75) {
    return {
      tone: "text-gold",
      short: `${zone.available} left`,
      full: `Filling up — ${zone.available} of ${zone.capacity} places left`,
      pickable: true,
    };
  }
  return {
    tone: "text-live",
    short: `${zone.available} free`,
    full: `${zone.available} of ${zone.capacity} places free`,
    pickable: true,
  };
}

export function SeatPicker({
  eventId,
  quantity,
  value,
  onChange,
  disabled = false,
  refreshToken = 0,
}: SeatPickerProps) {
  const { phase, data, retry } = useVenueZones(eventId, refreshToken);

  const zones = data?.zones ?? [];
  const bookable = zones.filter((z) => z.bookable);

  /*
   * A zone that fills up (or is redrawn by the host) while this screen is open
   * must not stay selected — the order would be refused at the till.
   */
  useEffect(() => {
    if (!value || phase !== "ready") return;
    const current = zones.find((z) => z.id === value.id);
    if (!current || !availability(current, quantity).pickable) {
      onChange(null);
    } else if (current.available !== value.available) {
      onChange(current);
    }
    // Re-checked whenever fresh availability arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, phase, quantity]);

  if (phase === "loading") {
    return (
      <section className="mt-4 border border-line bg-surface" aria-busy="true">
        <h2 className="t-micro border-b border-line px-4 py-3">Where you'll sit</h2>
        <p className="t-small flex items-center gap-2 px-4 py-5 text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Loading the seating plan…
        </p>
      </section>
    );
  }

  if (phase === "error") {
    return (
      <section className="mt-4 border border-line bg-surface">
        <h2 className="t-micro border-b border-line px-4 py-3">Where you'll sit</h2>
        <div className="px-4 py-4">
          <p className="t-small text-muted">
            We couldn't load this venue's seating plan. You can still book — your place will
            be assigned at the door.
          </p>
          <Button size="sm" className="mt-3" onClick={retry}>
            <RotateCw className="size-4" aria-hidden="true" />
            Reload seating plan
          </Button>
        </div>
      </section>
    );
  }

  // No plan drawn, or a plan with nothing sellable in it: this event simply
  // does not have a seat-picking step, and never mentions one.
  if (!data?.has_layout || bookable.length === 0) return null;

  const soldOut = bookable.every((z) => z.available === 0);

  return (
    <section className="mt-4 border border-line bg-surface">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="t-micro">Where you'll sit</h2>
        <span className="t-micro text-muted">Optional</span>
      </div>

      <div className="px-4 py-4">
        <p className="t-small text-muted">
          {soldOut
            ? `Every seated area at ${data.venue_name} is taken. You can still book — you'll be standing.`
            : `${data.venue_name} has a seating plan. Claim a spot, or leave it to us.`}
        </p>

        {/* ── The plan ─────────────────────────────────────────────────────
            A pointer shortcut and an orientation aid. Hidden from assistive
            technology on purpose: the list below says everything it says, in
            a form you can move through with a keyboard. */}
        <div
          aria-hidden="true"
          className="relative mt-4 w-full overflow-hidden border border-line bg-ink"
          style={{ aspectRatio: "4 / 3" }}
        >
          {zones.map((zone) => {
            const state = availability(zone, quantity);
            const selected = value?.id === zone.id;
            const structural = !zone.bookable;
            return (
              <button
                key={zone.id}
                type="button"
                tabIndex={-1}
                disabled={disabled || structural || !state.pickable}
                onClick={() => onChange(selected ? null : zone)}
                className={cn(
                  "absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden border px-0.5 text-center leading-tight transition-colors",
                  structural
                    ? "cursor-default border-dashed border-line bg-surface-2"
                    : selected
                      ? "border-signal bg-signal/15"
                      : state.pickable
                        ? "cursor-pointer border-line bg-surface-2 hover:border-paper/40"
                        : "cursor-not-allowed border-line bg-surface-2 opacity-45",
                  zone.type === "table" && "rounded-full",
                )}
                style={{
                  left: `${zone.x}%`,
                  top: `${zone.y}%`,
                  width: `${zone.w}%`,
                  height: `${zone.h}%`,
                }}
              >
                <span
                  className={cn(
                    "w-full truncate text-[clamp(7px,1.5vw,11px)] font-semibold",
                    structural
                      ? (STRUCTURAL_TONE[zone.type] ?? "text-muted")
                      : selected
                        ? "text-paper"
                        : "text-paper/85",
                  )}
                >
                  {zone.label}
                </span>
                {zone.bookable && (
                  <span
                    className={cn("text-[clamp(6px,1.1vw,10px)]", selected ? "text-paper" : state.tone)}
                  >
                    {state.short}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="t-micro mt-2 text-muted">Stage at the top · tap an area or use the list</p>

        {/* ── The control ─────────────────────────────────────────────────
            A plain radio group: one tab stop, arrow keys between areas, and
            no dependence on hitting a small shape with a thumb. */}
        <fieldset className="mt-4 border-0 p-0">
          <legend className="t-micro mb-2 text-muted">
            Choose an area for {quantity === 1 ? "your ticket" : `your ${quantity} tickets`}
          </legend>

          <div className="flex flex-col">
            <label
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-3 border border-line px-3 py-2.5",
                !value ? "bg-surface-2" : "bg-transparent",
                disabled && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name="venue-zone"
                /* A label wrapping two lines of text names this control
                   inconsistently across screen readers, so say it outright. */
                aria-label="No preference — we'll seat you on the night"
                className="size-4 shrink-0 accent-signal"
                checked={!value}
                disabled={disabled}
                onChange={() => onChange(null)}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[14px]">No preference</span>
                <span className="t-small block text-muted">
                  We'll seat you on the night — the usual for a standing gig.
                </span>
              </span>
            </label>

            {bookable.map((zone) => {
              const state = availability(zone, quantity);
              const selected = value?.id === zone.id;
              return (
                <label
                  key={zone.id}
                  className={cn(
                    "-mt-px flex min-h-[44px] items-center gap-3 border border-line px-3 py-2.5",
                    selected ? "border-signal bg-surface-2" : "bg-transparent",
                    state.pickable && !disabled ? "cursor-pointer" : "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="venue-zone"
                    aria-label={`${zone.label} — ${state.full}`}
                    className="size-4 shrink-0 accent-signal"
                    checked={selected}
                    disabled={disabled || !state.pickable}
                    onChange={() => onChange(zone)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px]">{zone.label}</span>
                    <span className={cn("t-small block", state.tone)}>{state.full}</span>
                  </span>
                  <span className="t-mono shrink-0 text-[12px] text-muted">
                    {zone.capacity} seats
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        {value && (
          <p className="t-small mt-3 flex items-start gap-1.5 text-paper/90">
            <MapPin className="mt-0.5 size-3.5 shrink-0 text-signal" aria-hidden="true" />
            <span>
              Holding {quantity === 1 ? "a place" : `${quantity} places`} at{" "}
              <span className="font-semibold">{value.label}</span>. It's printed on your ticket, so
              the door knows where you're meant to be.
            </span>
          </p>
        )}
      </div>
    </section>
  );
}
