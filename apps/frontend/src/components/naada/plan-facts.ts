/**
 * Facts derived from a floor plan — the same numbers the host sees while
 * designing and the guest sees while booking, so the two can never disagree.
 *
 * Works on a minimal structural shape so it accepts both the editor's own
 * elements and the zones the public API returns.
 */

export interface PlanItem {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  capacity: number;
  /** Restroom cubicles / speaker units. Absent on older plans. */
  count?: number;
  seats?: unknown[];
  /** Editor field name. */
  babyChairs?: number;
  /** API field name. */
  baby_chairs_total?: number;
}

export interface PlanSummary {
  restrooms: number;
  cubicles: number;
  speakers: number;
  tables: number;
  /** Individual chairs/sofa/bench seats placed on tables. */
  seats: number;
  babyChairs: number;
  tablesWithBabyChairs: number;
  capacity: number;
}

/** A restroom drawn with no cubicle count still counts as one. */
export function cubiclesOf(item: PlanItem): number {
  return item.count && item.count > 0 ? item.count : 1;
}

export function babyChairsOf(item: PlanItem): number {
  return item.babyChairs ?? item.baby_chairs_total ?? 0;
}

export function summarizePlan(items: PlanItem[]): PlanSummary {
  const s: PlanSummary = {
    restrooms: 0, cubicles: 0, speakers: 0, tables: 0,
    seats: 0, babyChairs: 0, tablesWithBabyChairs: 0, capacity: 0,
  };
  for (const it of items) {
    if (it.type === "restroom") {
      s.restrooms += 1;
      s.cubicles += cubiclesOf(it);
    } else if (it.type === "speaker") {
      s.speakers += 1;
    } else if (it.type === "table") {
      s.tables += 1;
      s.seats += it.seats?.length ?? 0;
      const b = babyChairsOf(it);
      s.babyChairs += b;
      if (b > 0) s.tablesWithBabyChairs += 1;
    }
    if (it.type !== "restroom" && it.type !== "speaker" && it.type !== "stage" &&
        it.type !== "entrance" && it.type !== "exit") {
      s.capacity += it.capacity;
    }
  }
  return s;
}

/** The canvas is 4:3, so a y-percentage is shorter than an x-percentage. */
const ASPECT = 3 / 4;
/** How close (in x-percent units) a seat area must be to a speaker to feel it. */
export const SPEAKER_RADIUS = 16;

function centre(it: PlanItem) {
  return { cx: it.x + it.w / 2, cy: (it.y + it.h / 2) * ASPECT };
}

/** True when a bookable area sits close enough to a speaker to be loud. */
export function isNearSpeaker(item: PlanItem, all: PlanItem[]): boolean {
  if (item.type === "speaker") return false;
  const a = centre(item);
  return all.some((o) => {
    if (o.type !== "speaker") return false;
    const b = centre(o);
    return Math.hypot(a.cx - b.cx, a.cy - b.cy) <= SPEAKER_RADIUS;
  });
}

/** Shortest gap-filling perimeter position for one more seat. */
export function largestGapT(ts: number[]): number {
  if (ts.length === 0) return 0;
  const sorted = [...ts].sort((a, b) => a - b);
  let best = 0;
  let bestT = sorted[0] + (1 - sorted[sorted.length - 1] + sorted[0]) / 2;
  sorted.forEach((t, i) => {
    const next = i === sorted.length - 1 ? sorted[0] + 1 : sorted[i + 1];
    const gap = next - t;
    if (gap > best) {
      best = gap;
      bestT = (t + gap / 2) % 1;
    }
  });
  return bestT;
}
