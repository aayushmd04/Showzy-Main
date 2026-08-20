import { cn } from "@/lib/utils";

/**
 * Section 9. Prototype-only affordance: flip a panel to any of its other
 * states without waiting three days. Mono type, --line border, deliberately
 * reads as tooling rather than product UI.
 */
export function StateToggle<T extends string>({
  value,
  options,
  onChange,
  label = "state:",
  className,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label?: string;
  className?: string;
}) {
  const id = `state-toggle-${label.replace(/\W/g, "")}`;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 border border-dashed border-line bg-ink px-2 py-1",
        className,
      )}
    >
      {label && (
        <label htmlFor={id} className="t-mono text-[11px] uppercase tracking-[0.08em] text-muted">
          {label}
        </label>
      )}
      <select
        id={id}
        aria-label={label ? undefined : "Prototype state"}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="t-mono cursor-pointer border-0 bg-transparent py-0.5 pr-1 text-[11px] uppercase tracking-[0.08em] text-paper outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-surface">
            {o.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
