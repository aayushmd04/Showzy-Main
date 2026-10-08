import { useMemo } from "react";
import type { NaadaEvent } from "@/data/fixtures";
import { dateListing } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Posters are typographic by design (Section 6): solid --surface-2 blocks with
 * the event name set large in condensed display type. No stock photos, ever.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const ACCENTS = ["#FF3D6E", "#E8B33C", "#3DDC91", "#E8763A"];

export function Poster({
  event,
  className,
  compact,
}: {
  event: NaadaEvent;
  className?: string;
  compact?: boolean;
}) {
  const { accent, variant, rotation, words } = useMemo(() => {
    const h = hash(event.id);
    return {
      accent: ACCENTS[h % ACCENTS.length],
      variant: h % 3,
      rotation: ((h >> 3) % 5) - 2,
      words: event.name.toUpperCase().split(" "),
    };
  }, [event.id, event.name]);

  // A real photo of the night beats a typeset flyer: show it, with the date and
  // sound on top. The name is already the page or card heading, so it is not
  // repeated here.
  const photo = (event as NaadaEvent & { _posterImage?: string })._posterImage;
  if (photo) {
    return (
      <div
        className={cn(
          "relative isolate aspect-[4/3] w-full overflow-hidden rounded-md border border-line bg-surface-2",
          className,
        )}
        role="img"
        aria-label={`Photo for ${event.name}, ${dateListing(event.date)}`}
      >
        <img src={photo} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/35"
        />
        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3 pt-3 text-[13px] font-semibold text-white">
          <span className="truncate rounded bg-black/55 px-2 py-1">{event.genres[0] ?? "Live"}</span>
          <span className="shrink-0 rounded bg-black/55 px-2 py-1">{dateListing(event.date)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative isolate aspect-[3/4] w-full overflow-hidden border border-line bg-surface-2",
        className,
      )}
      role="img"
      aria-label={`Poster for ${event.name} at ${dateListing(event.date)}`}
    >
      {/* Duotone wash */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.16]"
        style={{
          background:
            variant === 0
              ? `radial-gradient(120% 90% at 15% 0%, ${accent}, transparent 62%)`
              : variant === 1
                ? `linear-gradient(160deg, ${accent} -20%, transparent 55%)`
                : `radial-gradient(90% 70% at 85% 100%, ${accent}, transparent 60%)`,
        }}
      />
      {/* Misregistered risograph halftone */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.18]"
        style={{
          backgroundImage: `radial-gradient(${accent} 0.9px, transparent 0.9px)`,
          backgroundSize: "6px 6px",
          backgroundPosition: "1px 2px",
          maskImage: "linear-gradient(200deg, black 5%, transparent 70%)",
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.5] mix-blend-overlay scanline"
      />

      {/* Eyebrow */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-3 pt-3">
        <span className="t-micro truncate" style={{ color: accent }}>
          {event.genres[0] ?? "Live"}
        </span>
        <span className="t-micro shrink-0 text-paper/70">{dateListing(event.date)}</span>
      </div>

      {/* Name, set as big as it can go */}
      <div
        className={cn(
          "absolute inset-x-0 bottom-0 px-3 pb-3",
          variant === 1 && "flex h-full flex-col justify-center",
        )}
      >
        <div
          className="origin-bottom-left"
          style={{ transform: variant === 2 ? `rotate(${rotation}deg)` : undefined }}
        >
          {words.map((word, i) => (
            <div
              key={`${word}-${i}`}
              className="font-display font-extrabold uppercase leading-[0.86] tracking-[-0.03em]"
              style={{
                fontSize: compact
                  ? `clamp(13px, ${Math.min(26 / Math.max(word.length, 4), 5.2)}vw, 26px)`
                  : `clamp(18px, ${Math.min(52 / Math.max(word.length, 4), 9)}vw, 54px)`,
                color: i === 0 ? accent : "var(--color-paper)",
                fontStretch: "condensed",
              }}
            >
              {word}
            </div>
          ))}
        </div>
      </div>

      {/* Staple marks — it is a flyer on a pole */}
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-1.5 h-[3px] w-4 -translate-x-1/2 bg-paper/25"
      />
    </div>
  );
}
