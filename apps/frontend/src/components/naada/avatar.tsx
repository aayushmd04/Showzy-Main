import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** A stable 0–359 hue from a name, so the same person always gets the same colour. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/**
 * A person's or room's picture. When there is none (or it fails to load) it
 * draws a warm gradient with their initial, in the site's own type, instead of
 * a broken-image icon or a bare letter on grey.
 */
export function Avatar({
  src,
  name,
  className,
  rounded = "rounded-full",
}: {
  src?: string | null;
  name: string;
  className?: string;
  rounded?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("size-full object-cover", rounded, className)}
      />
    );
  }
  const hue = hueOf(name);
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-full place-items-center font-megrim text-[clamp(22px,40%,48px)] uppercase text-white", rounded, className)}
      style={{
        background: `linear-gradient(145deg, hsl(${(hue % 40) + 4} 62% 38%), hsl(${(hue % 50) + 28} 70% 26%))`,
      }}
    >
      {initial}
    </span>
  );
}
