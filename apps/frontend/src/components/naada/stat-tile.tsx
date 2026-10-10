import { cn } from "@/lib/utils";

/** A count tile: the number is the content, the label says what it counts. */
export function StatTile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone?: "brass" | "live" | "signal";
}) {
  return (
    <div className="glass-soft rounded-xl p-5">
      <p
        className={cn(
          "text-[clamp(26px,2.8vw,34px)] font-bold leading-none tabular-nums",
          tone === "brass" && "text-brass",
          tone === "live" && "text-live",
          tone === "signal" && "text-signal",
        )}
      >
        {value}
      </p>
      <p className="t-micro mt-2.5">{label}</p>
    </div>
  );
}
