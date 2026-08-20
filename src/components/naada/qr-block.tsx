import { useMemo } from "react";
import { cn } from "@/lib/utils";

/**
 * A rendered placeholder pattern — deterministic from the ticket code.
 * No QR library, no external image (Section 7.7).
 */
export function QrBlock({
  code,
  className,
  size = 21,
}: {
  code: string;
  className?: string;
  size?: number;
}) {
  const cells = useMemo(() => {
    let seed = 0;
    for (let i = 0; i < code.length; i++) seed = (seed * 31 + code.charCodeAt(i)) >>> 0;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const grid: boolean[] = [];
    const isFinder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= size - 7 && y < 7) || (x < 7 && y >= size - 7);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (isFinder(x, y)) {
          const lx = x >= size - 7 ? x - (size - 7) : x;
          const ly = y >= size - 7 ? y - (size - 7) : y;
          const ring = Math.max(Math.abs(lx - 3), Math.abs(ly - 3));
          grid.push(ring === 3 || ring <= 1);
        } else {
          grid.push(rand() > 0.52);
        }
      }
    }
    return grid;
  }, [code, size]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn("size-full", className)}
      shapeRendering="crispEdges"
      role="img"
      aria-label={`QR code placeholder for ticket ${code}`}
    >
      <rect width={size} height={size} fill="#F2F0EA" />
      {cells.map((on, i) =>
        on ? (
          <rect key={i} x={i % size} y={Math.floor(i / size)} width={1} height={1} fill="#0E0E12" />
        ) : null,
      )}
    </svg>
  );
}
