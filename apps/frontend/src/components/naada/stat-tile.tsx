import { cn } from "@/lib/utils";

/** Numbers in mono, labels in micro-caps (Section 7.9). */
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
    <div className="border border-line bg-surface p-4">
      <p
        className={cn(
          "t-mono text-[24px] font-medium leading-tight",
          tone === "brass" && "text-brass",
          tone === "live" && "text-live",
          tone === "signal" && "text-signal",
        )}
      >
        {value}
      </p>
      <p className="t-micro mt-2">{label}</p>
    </div>
  );
}
