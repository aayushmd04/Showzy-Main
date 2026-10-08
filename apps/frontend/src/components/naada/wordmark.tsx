import { cn } from "@/lib/utils";

export function Wordmark({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={cn(
        "font-display text-[19px] font-extrabold uppercase leading-none tracking-[0.12em] text-paper",
        className,
      )}
      style={{ fontStretch: "condensed", ...style }}
    >
      Naa<span className="text-signal">d</span>a
    </span>
  );
}
