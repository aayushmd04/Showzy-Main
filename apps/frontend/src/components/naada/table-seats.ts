/**
 * Shared table-seat geometry — the one place that knows how a seat's
 * perimeter position (`t`, 0..1) turns into an actual offset from a table's
 * center. Both the host's floor-plan editor and the buyer's seat picker
 * import from here so a seat renders at the same spot in both places,
 * regardless of which one computed `t`.
 *
 * Convention (matches the backend contract exactly):
 *  - `round`:  t=0 is 12 o'clock, walking clockwise.
 *  - `square` / `rectangle`: t=0 is the top-left corner, walking clockwise
 *    around the perimeter (top → right → bottom → left).
 *
 * Offsets are returned in the same 0-100 x/y units as the table's own `w`/`h`
 * (i.e. percent-of-canvas), so a caller just adds them to the table's own
 * center to get an absolute canvas position, or divides by w/h to get a
 * position local to the table's own box.
 */

export type TableShape = "round" | "square" | "rectangle";
export type Furniture = "chair" | "sofa" | "bench";
export type TableSide = "top" | "right" | "bottom" | "left";

export interface TableSeat {
  id: string;
  /** 0..1, position walked around the table's perimeter. */
  t: number;
  furniture: Furniture;
  /** Seats sharing a groupId render as one continuous sofa/bench. */
  groupId: string | null;
}

let _seatCounter = 0;
function nextId(prefix: string): string {
  _seatCounter += 1;
  return `${prefix}_${Date.now()}_${_seatCounter}`;
}

function normalize(t: number): number {
  return ((t % 1) + 1) % 1;
}

/** A table drawn before this feature shipped has no `shape` — treat it as round. */
export function resolveTableShape(shape: string | null | undefined): TableShape {
  return shape === "square" || shape === "rectangle" ? shape : "round";
}

/**
 * Offset from the table's own center for a seat at perimeter position `t`,
 * given the table's current `w`/`h` (0-100 canvas units). Same math for
 * every consumer — this is the one function that owns the "where does a
 * seat actually sit" question.
 */
export function seatOffset(
  shape: TableShape,
  t: number,
  w: number,
  h: number,
): { dx: number; dy: number } {
  const tt = normalize(t);

  if (shape === "round") {
    const angle = tt * 2 * Math.PI - Math.PI / 2;
    return { dx: (w / 2) * Math.cos(angle), dy: (h / 2) * Math.sin(angle) };
  }

  // square / rectangle: t=0 at top-left corner, clockwise around the
  // perimeter — top edge, then right, then bottom, then left.
  const perimeter = 2 * w + 2 * h;
  const d = tt * perimeter;

  if (d <= w) {
    return { dx: -w / 2 + d, dy: -h / 2 }; // top edge, left → right
  }
  if (d <= w + h) {
    return { dx: w / 2, dy: -h / 2 + (d - w) }; // right edge, top → bottom
  }
  if (d <= 2 * w + h) {
    return { dx: w / 2 - (d - w - h), dy: h / 2 }; // bottom edge, right → left
  }
  return { dx: -w / 2, dy: h / 2 - (d - 2 * w - h) }; // left edge, bottom → top
}

/**
 * Evenly spaced seats around the whole perimeter — the "start from scratch"
 * action. `shape` isn't read here: `t` is perimeter-relative by design, so
 * evenly-spaced positions are the same fractions regardless of shape — kept
 * as a parameter anyway to match `addSeatGroup`'s signature and because a
 * future shape (e.g. an oval) might one day need non-uniform spacing.
 */
export function autoGenerateSeats(_shape: TableShape, count: number, furniture: Furniture): TableSeat[] {
  if (count <= 0) return [];
  const seats: TableSeat[] = [];
  for (let i = 0; i < count; i++) {
    seats.push({ id: nextId("seat"), t: i / count, furniture, groupId: null });
  }
  return seats;
}

/** How wide a berth (in perimeter fraction) to give each seat of a round-table group. */
const ROUND_ARC_PER_SEAT = 1 / 16; // ~22.5° — a comfortable sofa/bench width

/**
 * Appends a grouped run of `count` seats (one continuous sofa/bench) to the
 * existing list, without touching any seat already there.
 *
 * - square / rectangle: `side` names the edge to place the group along
 *   (needs `dims` — the table's current w/h — to know how much of the
 *   perimeter that edge actually covers).
 * - round: pass a number for `side` to use it as the starting perimeter
 *   fraction (0..1); anything else (or omitted) continues on from the last
 *   existing seat, spaced evenly within a reasonable arc — the simple
 *   default the editor uses instead of a full arc-picker.
 */
export function addSeatGroup(
  existingSeats: TableSeat[],
  shape: TableShape,
  side: TableSide | number,
  count: number,
  furniture: Furniture,
  dims?: { w: number; h: number },
): TableSeat[] {
  if (count <= 0) return existingSeats;
  const groupId = nextId("grp");
  const ts: number[] = [];

  if (shape === "round") {
    const startT =
      typeof side === "number"
        ? side
        : existingSeats.length
          ? normalize(Math.max(...existingSeats.map((s) => s.t)) + ROUND_ARC_PER_SEAT)
          : 0;
    for (let i = 0; i < count; i++) ts.push(normalize(startT + i * ROUND_ARC_PER_SEAT));
  } else {
    const w = dims?.w ?? 10;
    const h = dims?.h ?? 10;
    const perimeter = 2 * w + 2 * h;
    const edgeSide: TableSide = typeof side === "number" ? "top" : side;
    const ranges: Record<TableSide, [number, number]> = {
      top: [0, w / perimeter],
      right: [w / perimeter, (w + h) / perimeter],
      bottom: [(w + h) / perimeter, (2 * w + h) / perimeter],
      left: [(2 * w + h) / perimeter, 1],
    };
    const [from, to] = ranges[edgeSide];
    const span = to - from;
    const margin = span * 0.15;
    const usable = Math.max(0, span - margin * 2);
    for (let i = 0; i < count; i++) {
      const frac = count === 1 ? 0.5 : i / (count - 1);
      ts.push(normalize(from + margin + frac * usable));
    }
  }

  const added = ts.map((t) => ({ id: nextId("seat"), t, furniture, groupId }));
  return [...existingSeats, ...added];
}
