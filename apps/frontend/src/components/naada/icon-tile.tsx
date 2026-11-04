import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The mark on a card: a line icon in gold on a black tile with a slow ember
 * edge. Used where emoji used to be, so cards read as one set with the rest of
 * the site. Decorative: the card's heading carries the meaning.
 */
export function IconTile({
  icon: Icon,
  size = 56,
  still = false,
  className,
}: {
  icon: LucideIcon;
  /** Edge length in px. */
  size?: number;
  /** Turn the travelling edge off (a long list of tiles is calmer without it). */
  still?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn("icon-tile", still && "icon-tile--still", className)}
      style={{ ["--tile-size" as string]: `${size}px` }}
    >
      <span className="icon-tile__face">
        <Icon />
      </span>
    </span>
  );
}
