import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "How many tickets?" — a stepper rather than a free-text number, so nobody can
 * type 0, 500 or "ten". The caller supplies the bounds; hitting one says why.
 */
export function QuantityStepper({
  value,
  min,
  max,
  onChange,
  label = "Tickets",
  className,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  label?: string;
  className?: string;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  const btn =
    "grid size-11 place-items-center border border-line transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span id="qty-label" className="t-small text-muted">
        {label}
      </span>
      <div className="flex items-center" role="group" aria-labelledby="qty-label">
        <button
          type="button"
          className={btn}
          disabled={atMin}
          onClick={() => onChange(value - 1)}
          aria-label="Fewer tickets"
        >
          <Minus className="size-4" aria-hidden="true" />
        </button>
        <output
          aria-live="polite"
          aria-label={`${value} ${value === 1 ? "ticket" : "tickets"} selected`}
          className="t-mono grid h-11 min-w-12 place-items-center border-y border-line px-3 text-[16px]"
        >
          {value}
        </output>
        <button
          type="button"
          className={btn}
          disabled={atMax}
          onClick={() => onChange(value + 1)}
          aria-label="More tickets"
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
