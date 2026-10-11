import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Armchair, Baby, Building2, Check, Copy, Eye, Grid3X3, Minus, RotateCcw, Save, Sofa, StretchHorizontal, Trash2, Plus, X } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError, getMyVenues, updateVenue, type ApiVenue } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SeatPickerView, type VenueZone, type ZonesResponse } from "@/components/naada/seat-picker";
import { largestGapT, SPEAKER_RADIUS, summarizePlan } from "@/components/naada/plan-facts";
import {
  addSeatGroup,
  autoGenerateSeats,
  resolveTableShape,
  seatOffset,
  type Furniture,
  type TableSeat,
  type TableShape,
  type TableSide,
} from "@/components/naada/table-seats";

// ── Types ──────────────────────────────────────────────────────────────────────

type EType =
  | "stage" | "seating" | "table" | "dance_floor"
  | "bar" | "standing" | "vip" | "entrance" | "exit"
  | "restroom" | "speaker";

interface LE {
  id: string;
  type: EType;
  x: number;   // 0–100  (% of canvas width)
  y: number;   // 0–100  (% of canvas height)
  w: number;   // 0–100
  h: number;   // 0–100
  label: string;
  capacity: number;
  /** Only meaningful for type "table". Absent on layouts saved before this
   *  shipped — always read it through `resolveTableShape`, never directly. */
  shape?: TableShape;
  /** Per-seat booking for a table. Absent/empty = today's whole-table
   *  quantity booking, unchanged. */
  seats?: TableSeat[];
  /** Restroom cubicles. Only meaningful for type "restroom". */
  count?: number;
  /** Free baby/high chairs this table offers guests. Only for type "table". */
  babyChairs?: number;
}

const FURNITURE_ICON: Record<Furniture, typeof Armchair> = {
  chair: Armchair,
  sofa: Sofa,
  bench: StretchHorizontal,
};

const FURNITURE_LABEL: Record<Furniture, string> = {
  chair: "chair",
  sofa: "sofa",
  bench: "bench",
};

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origX: number;  // el.x for move, el.w for resize
  origY: number;  // el.y for move, el.h for resize
  mode: "move" | "resize";
}

// ── Element palette ────────────────────────────────────────────────────────────

const PALETTE: Record<
  EType,
  { label: string; emoji: string; bg: string; fg: string; dw: number; dh: number; round: boolean }
> = {
  stage:       { label: "Stage",         emoji: "🎭", bg: "#1C1005", fg: "#E8B85C", dw: 36, dh: 14, round: false },
  seating:     { label: "Seating",       emoji: "💺", bg: "#1A2A1A", fg: "#7FBA7F", dw: 22, dh: 20, round: false },
  table:       { label: "Table",         emoji: "⬤",  bg: "#2A1F10", fg: "#C89050", dw: 11, dh: 14.5, round: true  },
  dance_floor: { label: "Dance Floor",   emoji: "🕺", bg: "#0A0A2A", fg: "#8080F0", dw: 32, dh: 22, round: false },
  bar:         { label: "Bar / Counter", emoji: "🍺", bg: "#1F1008", fg: "#D07040", dw: 26, dh:  8, round: false },
  standing:    { label: "Standing Zone", emoji: "🧍", bg: "#141E14", fg: "#60B060", dw: 20, dh: 16, round: false },
  vip:         { label: "VIP Section",   emoji: "⭐", bg: "#1F0C1F", fg: "#C060C0", dw: 18, dh: 18, round: false },
  entrance:    { label: "Entrance",      emoji: "🚪", bg: "#0C1F0C", fg: "#50C050", dw: 12, dh:  7, round: false },
  exit:        { label: "Exit",          emoji: "🔴", bg: "#1F0C0C", fg: "#C05050", dw: 12, dh:  7, round: false },
  restroom:    { label: "Restrooms",     emoji: "🚻", bg: "#0E1B26", fg: "#6FB6E0", dw: 14, dh: 11, round: false },
  speaker:     { label: "Speaker",       emoji: "🔊", bg: "#2A210C", fg: "#F0C860", dw:  5, dh:  6.5, round: true },
};

/** The palette, grouped the way a host thinks about a room. */
const PALETTE_GROUPS: { title: string; types: EType[] }[] = [
  { title: "Room", types: ["stage", "entrance", "exit"] },
  { title: "Seating", types: ["table", "seating", "vip", "standing", "dance_floor"] },
  { title: "Facilities", types: ["bar", "restroom", "speaker"] },
];

/** Things a guest can't book — they describe the room. */
const NON_BOOKABLE: EType[] = ["stage", "entrance", "exit", "restroom", "speaker"];

const MAX_CHAIRS = 24;
const MAX_BABY_CHAIRS = 8;

// ── Default venue floor plan ───────────────────────────────────────────────────

function tableWithChairs(id: string, label: string, x: number, y: number, chairs: number, babyChairs = 0): LE {
  return {
    id, type: "table", x, y, w: 11, h: 14.5, label, capacity: chairs,
    shape: "round", seats: autoGenerateSeats("round", chairs, "chair"), babyChairs,
  };
}

const DEFAULT_LAYOUT: LE[] = [
  { id: "s1", type: "stage",       x: 33, y:  4, w: 34, h: 14, label: "Main Stage",  capacity: 0  },
  { id: "sp1", type: "speaker",    x: 25, y:  7, w:  5, h: 6.5, label: "Speaker",    capacity: 0  },
  { id: "sp2", type: "speaker",    x: 70, y:  7, w:  5, h: 6.5, label: "Speaker",    capacity: 0  },
  { id: "r1", type: "restroom",    x:  2, y:  3, w: 10, h: 12, label: "Restrooms",   capacity: 0, count: 4 },
  { id: "d1", type: "dance_floor", x: 28, y: 22, w: 44, h: 26, label: "Dance Floor", capacity: 80 },
  tableWithChairs("t1", "Table A", 7, 24, 4, 1),
  tableWithChairs("t2", "Table B", 7, 46, 6),
  tableWithChairs("t3", "Table C", 76, 24, 4, 2),
  tableWithChairs("t4", "Table D", 76, 46, 6),
  { id: "b1", type: "bar",         x:  4, y: 74, w: 26, h:  8, label: "Bar",         capacity: 0  },
  { id: "v1", type: "vip",         x: 66, y: 66, w: 22, h: 20, label: "VIP Section", capacity: 20 },
  { id: "e1", type: "entrance",    x: 44, y: 90, w: 12, h:  7, label: "Entrance",    capacity: 0  },
  { id: "x1", type: "exit",        x: 88, y: 90, w: 10, h:  7, label: "Exit",        capacity: 0  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Seats are the source of truth for a table's capacity once it has any — the
 * editor enforces this on every in-session edit (see `patch` below), but a
 * plan loaded from the server or an older localStorage draft may have been
 * written before that rule applied (or edited directly against the API), so
 * re-assert it once on load rather than trusting whatever number is stored.
 */
function normalizeElements(elements: LE[]): LE[] {
  return elements.map((e) =>
    e.seats && e.seats.length > 0 && e.capacity !== e.seats.length
      ? { ...e, capacity: e.seats.length }
      : e,
  );
}

let _counter = 0;
function uid() { return `el_${Date.now()}_${++_counter}`; }
function snap(v: number, on: boolean) { return on ? Math.round(v / 2.5) * 2.5 : v; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

/** "4 chairs, 1 sofa (3 seats)" — a plain-English readout of a table's seats. */
function seatBreakdown(seats: TableSeat[]): string {
  if (seats.length === 0) return "No seats yet";
  const parts: string[] = [];
  (["chair", "sofa", "bench"] as Furniture[]).forEach((furniture) => {
    const matching = seats.filter((s) => s.furniture === furniture);
    if (matching.length === 0) return;
    const groupIds = new Set(matching.map((s) => s.groupId).filter((g): g is string => g !== null));
    const ungrouped = matching.filter((s) => s.groupId === null).length;
    const units = groupIds.size + ungrouped;
    if (units === matching.length) {
      // Nothing grouped — plain count.
      parts.push(`${matching.length} ${FURNITURE_LABEL[furniture]}${matching.length === 1 ? "" : "s"}`);
    } else {
      parts.push(`${units} ${FURNITURE_LABEL[furniture]}${units === 1 ? "" : "s"} (${matching.length} seats)`);
    }
  });
  return parts.join(", ");
}

/** Bounding box (in the table's own 0–100 local box, i.e. 0–100 = full w/h) for a group's seats, for the "one continuous shape" backing shape. */
function groupBounds(seats: TableSeat[], groupId: string, shape: TableShape, w: number, h: number) {
  const members = seats.filter((s) => s.groupId === groupId).sort((a, b) => a.t - b.t);
  let minX = 50, maxX = 50, minY = 50, maxY = 50;
  members.forEach((s) => {
    const { dx, dy } = seatOffset(shape, s.t, w, h);
    const lx = 50 + (dx / w) * 100;
    const ly = 50 + (dy / h) * 100;
    minX = Math.min(minX, lx); maxX = Math.max(maxX, lx);
    minY = Math.min(minY, ly); maxY = Math.max(maxY, ly);
  });
  return { minX, maxX, minY, maxY, members };
}

const STORAGE_KEY = "naada_venue_layout";

// ── Screen ────────────────────────────────────────────────────────────────────

export function HostVenueLayoutScreen() {
  /*
   * The plan belongs to the venue on the server, not to this browser.
   *
   * It used to live only in localStorage, so a host's floor plan never reached
   * the backend — buyers could never be shown it, staff could never see it, and
   * clearing the browser threw the work away. localStorage stays, but only as a
   * draft buffer for edits made while a save is failing.
   */
  const [elements, setElements] = useState<LE[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return normalizeElements(s ? JSON.parse(s) : DEFAULT_LAYOUT);
    } catch {
      return DEFAULT_LAYOUT;
    }
  });
  const [venue, setVenue] = useState<ApiVenue | null>(null);
  const [loadPhase, setLoadPhase] = useState<"loading" | "ready" | "no-venue" | "error">("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const loadedRef = useRef(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(true);
  const [savedMsg, setSavedMsg] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const gridRef = useRef(gridOn);
  useEffect(() => { gridRef.current = gridOn; }, [gridOn]);

  const sel = elements.find((e) => e.id === selected) ?? null;
  const selShape = sel ? resolveTableShape(sel.shape) : "round";
  const selSeats = sel?.seats ?? [];

  // Seats sub-panel form state — one shared draft, fine to leave stale
  // across selection changes since it's just an input the host is about to
  // fill in again anyway.
  const [groupFurniture, setGroupFurniture] = useState<Furniture>("sofa");
  const [groupCount, setGroupCount] = useState(3);
  const [groupSide, setGroupSide] = useState<TableSide>("top");

  // Load this host's venue and whatever plan it already has.
  useEffect(() => {
    let alive = true;
    getMyVenues()
      .then((venues) => {
        if (!alive) return;
        const mine = venues[0];
        if (!mine) {
          // No venue to save to yet, but edits should still survive a
          // reload via the localStorage draft buffer — without this the
          // auto-save effect below stays gated forever and "kept in this
          // browser" (see the banner) would quietly not be true.
          loadedRef.current = true;
          setLoadPhase("no-venue");
          return;
        }
        setVenue(mine);
        const stored = (mine as { layout?: { elements?: LE[] } }).layout;
        if (stored?.elements?.length) setElements(normalizeElements(stored.elements));
        loadedRef.current = true;
        setLoadPhase("ready");
      })
      .catch(() => {
        if (alive) setLoadPhase("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  // ── Persistence ──────────────────────────────────────────────────────────────

  const persist = useCallback(
    async (next: LE[]) => {
      // Keep a local copy first, so an edit survives a failed request.
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* storage full */ }

      if (!venue?.slug) return;
      setSaving(true);
      try {
        await updateVenue(venue.slug, { layout: { version: 1, elements: next } });
        setSaveError(null);
        setSavedMsg(true);
        setTimeout(() => setSavedMsg(false), 2200);
      } catch (err) {
        setSaveError(
          err instanceof ApiError
            ? err.detail
            : "Couldn't save to the server. Your changes are kept here and will save when you're back online.",
        );
      } finally {
        setSaving(false);
      }
    },
    [venue],
  );

  const save = useCallback(() => { void persist(elements); }, [persist, elements]);

  // Auto-save, debounced. Skipped until the stored plan has loaded, so an
  // empty first render can never overwrite a real saved layout.
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => { void persist(elements); }, 900);
    return () => clearTimeout(t);
  }, [elements, persist]);

  // ── Element mutations ──────────────────────────────────────────────────────────

  const addElement = (type: EType) => {
    const p = PALETTE[type];
    const base: LE = {
      id: uid(),
      type,
      x: clamp(50 - p.dw / 2, 0, 100 - p.dw),
      y: clamp(50 - p.dh / 2, 0, 100 - p.dh),
      w: p.dw,
      h: p.dh,
      label: p.label,
      capacity: 0,
    };
    let el = base;
    if (type === "table") {
      // A table with no chairs is a puzzle — start with four and let the host adjust.
      const n = elements.filter((e) => e.type === "table").length;
      el = {
        ...base,
        label: `Table ${n < 26 ? String.fromCharCode(65 + n) : n + 1}`,
        shape: "round",
        seats: autoGenerateSeats("round", 4, "chair"),
        capacity: 4,
        babyChairs: 0,
      };
    } else if (type === "restroom") {
      el = { ...base, count: 2 };
    } else if (type === "speaker") {
      el = { ...base, label: "Speaker" };
    }
    setElements((prev) => [...prev, el]);
    setSelected(el.id);
  };

  const duplicateSelected = () => {
    if (!sel) return;
    const copy: LE = {
      ...sel,
      id: uid(),
      x: clamp(sel.x + 3, 0, 100 - sel.w),
      y: clamp(sel.y + 4, 0, 100 - sel.h),
      // Seats need fresh ids — a seat id is what a guest actually books.
      seats: sel.seats?.map((st) => ({ ...st, id: `seat_${uid()}` })),
    };
    setElements((prev) => [...prev, copy]);
    setSelected(copy.id);
  };

  const deleteSelected = () => {
    if (!selected) return;
    setElements((prev) => prev.filter((e) => e.id !== selected));
    setSelected(null);
  };

  const patch = (fields: Partial<LE>) => {
    if (!selected) return;
    setElements((prev) => prev.map((e) => (e.id === selected ? { ...e, ...fields } : e)));
  };

  // Seats are the source of truth for capacity once a table has any — keep
  // that number in sync with whatever the seat list actually holds.
  const setTableSeats = (seats: TableSeat[]) => {
    patch(seats.length > 0 ? { seats, capacity: seats.length } : { seats });
  };

  /**
   * Set the number of loose chairs on the selected table. With no sofa/bench
   * on it the chairs are re-spaced evenly; otherwise chairs are added into the
   * biggest free gap (or the last one removed) so the sofa is left alone.
   */
  const setChairCount = (raw: number) => {
    if (!sel) return;
    const n = clamp(Math.round(raw), 0, MAX_CHAIRS);
    const grouped = selSeats.some((st) => st.groupId !== null);
    if (!grouped) {
      patch({ seats: autoGenerateSeats(selShape, n, "chair"), capacity: n });
      return;
    }
    let next = [...selSeats];
    let loose = next.filter((st) => st.groupId === null).length;
    while (loose < n && next.length < MAX_CHAIRS) {
      next.push({ id: `seat_${uid()}`, t: largestGapT(next.map((st) => st.t)), furniture: "chair", groupId: null });
      loose += 1;
    }
    while (loose > n) {
      const idx = next.map((st) => st.groupId === null).lastIndexOf(true);
      next = next.filter((_, i) => i !== idx);
      loose -= 1;
    }
    patch({ seats: next, capacity: next.length });
  };

  // Canvas seat markers render for every table regardless of which is
  // currently selected, so removing one there can't go through `patch`
  // (which only ever targets `selected`) — it addresses the table directly.
  const removeSeatFromTable = (elId: string, seatId: string) => {
    setElements((prev) =>
      prev.map((e) => {
        if (e.id !== elId || !e.seats) return e;
        const seats = e.seats.filter((s) => s.id !== seatId);
        return { ...e, seats, ...(seats.length > 0 ? { capacity: seats.length } : {}) };
      }),
    );
  };

  // Delete/Backspace removes the selected zone — unless the host is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) return;
      if (!selected || previewOpen) return;
      e.preventDefault();
      setElements((prev) => prev.filter((el) => el.id !== selected));
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, previewOpen]);

  const reset = () => {
    if (!confirm("Reset layout to the default template? Unsaved changes will be lost.")) return;
    setElements(DEFAULT_LAYOUT);
    setSelected(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  // ── Drag (full-screen overlay during drag so pointer never escapes) ───────────

  const startDrag = useCallback(
    (e: React.PointerEvent, id: string, mode: "move" | "resize") => {
      e.stopPropagation();
      setSelected(id);
      setElements((prev) => {
        const el = prev.find((el) => el.id === id);
        if (el) {
          drag.current = {
            id,
            startX: e.clientX,
            startY: e.clientY,
            origX: mode === "move" ? el.x : el.w,
            origY: mode === "move" ? el.y : el.h,
            mode,
          };
        }
        return prev; // no change — just reading
      });
      setIsDragging(true);
    },
    [],
  );

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = ((e.clientX - drag.current.startX) / rect.width) * 100;
    const dy = ((e.clientY - drag.current.startY) / rect.height) * 100;
    const { id, origX, origY, mode } = drag.current;
    const g = gridRef.current;
    setElements((prev) =>
      prev.map((el) => {
        if (el.id !== id) return el;
        if (mode === "move") {
          return {
            ...el,
            x: snap(clamp(origX + dx, 0, 100 - el.w), g),
            y: snap(clamp(origY + dy, 0, 100 - el.h), g),
          };
        }
        return {
          ...el,
          w: snap(clamp(origX + dx, 5, 100 - el.x), g),
          h: snap(clamp(origY + dy, 5, 100 - el.y), g),
        };
      }),
    );
  }, []);

  const endDrag = useCallback(() => {
    drag.current = null;
    setIsDragging(false);
  }, []);

  // ── Legend rows ───────────────────────────────────────────────────────────────

  const legend = (Object.keys(PALETTE) as EType[])
    .map((t) => ({
      type: t,
      count: elements.filter((e) => e.type === t).length,
      capacity: elements.filter((e) => e.type === t).reduce((s, e) => s + e.capacity, 0),
    }))
    .filter((r) => r.count > 0);

  const facts = useMemo(() => summarizePlan(elements), [elements]);
  const totalCap = facts.capacity;

  /** What's still missing from a room a guest can make sense of. */
  const checklist = [
    { key: "stage", done: elements.some((e) => e.type === "stage"), label: "A stage", add: "stage" as EType },
    { key: "entrance", done: elements.some((e) => e.type === "entrance"), label: "An entrance", add: "entrance" as EType },
    { key: "exit", done: elements.some((e) => e.type === "exit"), label: "An exit", add: "exit" as EType },
    { key: "seating", done: facts.seats > 0 || elements.some((e) => ["seating", "vip", "standing", "dance_floor"].includes(e.type) && e.capacity > 0), label: "Somewhere to sit or stand", add: "table" as EType },
    { key: "restroom", done: facts.restrooms > 0, label: "Restrooms", add: "restroom" as EType },
    { key: "speaker", done: facts.speakers > 0, label: "Speakers", add: "speaker" as EType },
  ];

  return (
    <ConsoleShell nav={HOST_NAV} breadcrumb={["Venue", "Layout Designer"]}>
      {/* Full-screen drag overlay — captures pointer while dragging */}
      {isDragging && (
        <div
          className="fixed inset-0 z-[9999]"
          style={{ cursor: drag.current?.mode === "resize" ? "se-resize" : "grabbing" }}
          onPointerMove={onDragMove}
          onPointerUp={endDrag}
          onPointerLeave={endDrag}
        />
      )}

      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-h1">Venue Layout Designer</h1>
          <p className="t-small mt-1 max-w-[52ch] text-muted">
            Build your room in three steps: add zones from the left, give tables their chairs,
            then check “Preview as guest” to see exactly what your attendees will see when booking.
          </p>

          {loadPhase === "loading" && (
            <p className="t-small mt-2 text-muted">Loading your venue…</p>
          )}
          {loadPhase === "ready" && venue && (
            <p className="t-small mt-2 text-muted">
              Saving to <span className="text-paper">{venue.name}</span>
              {saving && " · saving…"}
            </p>
          )}
          {loadPhase === "no-venue" && (
            <p className="t-small mt-2 text-brass">
              You don't have a venue yet, so this plan can only be kept in this browser.
              Add your venue first and it'll save properly.
            </p>
          )}
          {loadPhase === "error" && (
            <p className="t-small mt-2 text-brass">
              Couldn't reach the server. You can keep editing — changes are held here until
              it's back.
            </p>
          )}
          {saveError && <p className="t-small mt-2 text-fault">{saveError}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setGridOn((g) => !g)}>
            <Grid3X3 className="size-4" />
            {gridOn ? "Grid on" : "Grid off"}
          </Button>
          <Button size="sm" onClick={reset}>
            <RotateCcw className="size-4" />
            Reset
          </Button>
          <Button size="sm" onClick={() => setPreviewOpen(true)}>
            <Eye className="size-4" />
            Preview as guest
          </Button>
          <Button size="sm" variant="primary" onClick={save}>
            <Save className="size-4" />
            {savedMsg ? "Saved ✓" : "Save layout"}
          </Button>
        </div>
      </div>

      {/* ── Three-column editor ── */}
      <div className="flex flex-col gap-3 lg:flex-row" style={{ minHeight: 500 }}>

        {/* Left toolbar */}
        <aside className="shrink-0 glass-soft rounded-xl lg:w-[176px]">
          <div className="border-b border-line px-3 py-2">
            <p className="t-micro">1 · Add to your room</p>
          </div>
          <div className="flex flex-col gap-2 p-2">
            {PALETTE_GROUPS.map((group) => (
              <div key={group.title}>
                <p className="t-micro px-2 pb-1 text-muted/70">{group.title}</p>
                <div className="flex flex-col gap-0.5">
                  {group.types.map((type) => {
                    const p = PALETTE[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => addElement(type)}
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-paper/5"
                      >
                        <span className="text-[15px] leading-none">{p.emoji}</span>
                        <span className="truncate text-paper/80">{p.label}</span>
                        <Plus className="ml-auto size-3 shrink-0 text-muted" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas */}
        <div className="min-w-0 flex-1">
          <div
            ref={canvasRef}
            className="relative w-full overflow-hidden border border-line select-none"
            style={{
              aspectRatio: "4/3",
              background: "#0D0A06",
              backgroundImage: gridOn
                ? "linear-gradient(rgba(200,150,60,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(200,150,60,.07) 1px,transparent 1px)"
                : undefined,
              backgroundSize: gridOn ? "2.5% 2.5%" : undefined,
              cursor: "default",
            }}
            onClick={() => { if (!isDragging) setSelected(null); }}
          >
            {/* Speaker reach — a soft ring so a host can see which seats will be loud. */}
            {elements.filter((e) => e.type === "speaker").map((e) => (
              <div
                key={`ring-${e.id}`}
                className="pointer-events-none absolute rounded-full"
                style={{
                  left: `${e.x + e.w / 2 - SPEAKER_RADIUS}%`,
                  top: `${e.y + e.h / 2 - (SPEAKER_RADIUS * 4) / 3}%`,
                  width: `${SPEAKER_RADIUS * 2}%`,
                  height: `${(SPEAKER_RADIUS * 8) / 3}%`,
                  border: "1px dashed rgba(240,200,96,.35)",
                  background: "rgba(240,200,96,.04)",
                }}
              />
            ))}
            {elements.map((el) => {
              const p = PALETTE[el.type];
              const isSel = el.id === selected;
              // A table's own shape overrides the palette default once it's
              // been set; every other element type keeps the palette's call.
              const isRoundVisual = el.type === "table" ? resolveTableShape(el.shape) === "round" : p.round;
              const tableSeats = el.type === "table" ? (el.seats ?? []) : [];
              const tableGroupIds =
                tableSeats.length > 0
                  ? Array.from(new Set(tableSeats.map((s) => s.groupId).filter((g): g is string => g !== null)))
                  : [];
              return (
                <div
                  key={el.id}
                  style={{
                    position: "absolute",
                    left: `${el.x}%`,
                    top: `${el.y}%`,
                    width: `${el.w}%`,
                    height: `${el.h}%`,
                    background: p.bg,
                    borderRadius: isRoundVisual ? "50%" : 3,
                    border: `1.5px solid ${isSel ? "#E8B85C" : "rgba(255,255,255,.1)"}`,
                    boxShadow: isSel
                      ? "0 0 0 2px rgba(232,184,92,.25), 0 0 16px rgba(232,184,92,.1)"
                      : undefined,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 1,
                    zIndex: isSel ? 10 : 1,
                    cursor: "grab",
                    userSelect: "none",
                    transition: "border-color .1s, box-shadow .1s",
                  }}
                  onPointerDown={(e) => startDrag(e, el.id, "move")}
                  onClick={(e) => { e.stopPropagation(); setSelected(el.id); }}
                >
                  {(el.type === "restroom" || el.type === "speaker") && (
                    <span style={{ fontSize: "clamp(12px,2.4vw,24px)", lineHeight: 1, pointerEvents: "none" }}>
                      {p.emoji}
                    </span>
                  )}
                  {el.type !== "speaker" && (
                  <span
                    style={{
                      fontSize: "clamp(6px,1.3vw,12px)",
                      color: p.fg,
                      fontWeight: 700,
                      lineHeight: 1.2,
                      textAlign: "center",
                      padding: "0 4px",
                      wordBreak: "break-word",
                      pointerEvents: "none",
                    }}
                  >
                    {el.label}
                    {el.type === "restroom" && (el.count ?? 0) > 1 ? ` ×${el.count}` : ""}
                  </span>
                  )}
                  {el.capacity > 0 && !NON_BOOKABLE.includes(el.type) && (
                    <span
                      style={{
                        fontSize: "clamp(5px,.9vw,9px)",
                        color: p.fg,
                        opacity: 0.55,
                        lineHeight: 1,
                        pointerEvents: "none",
                      }}
                    >
                      {el.capacity} seats
                    </span>
                  )}
                  {/* Resize handle */}
                  {isSel && el.type !== "speaker" && (
                    <div
                      title="Drag to resize"
                      style={{
                        position: "absolute",
                        bottom: -5,
                        right: -5,
                        width: 11,
                        height: 11,
                        borderRadius: 2,
                        background: "#E8B85C",
                        cursor: "se-resize",
                        zIndex: 20,
                      }}
                      onPointerDown={(e) => startDrag(e, el.id, "resize")}
                    />
                  )}

                  {/* Sofa/bench backing shapes — one continuous shape per group,
                      drawn under the individually-clickable seat markers. */}
                  {tableGroupIds.map((gid) => {
                    const { minX, maxX, minY, maxY } = groupBounds(tableSeats, gid, resolveTableShape(el.shape), el.w, el.h);
                    const pad = 3.5;
                    return (
                      <div
                        key={gid}
                        style={{
                          position: "absolute",
                          left: `${minX - pad}%`,
                          top: `${minY - pad}%`,
                          width: `${Math.max(maxX - minX + pad * 2, pad * 2)}%`,
                          height: `${Math.max(maxY - minY + pad * 2, pad * 2)}%`,
                          borderRadius: 7,
                          background: "rgba(232,184,92,.22)",
                          border: "1px solid rgba(232,184,92,.55)",
                          pointerEvents: "none",
                          zIndex: 4,
                        }}
                      />
                    );
                  })}

                  {/* Chairs — big enough to see and read. Select the table, then
                      click a chair to remove it; the stepper on the right is the
                      easy way to add or remove them. */}
                  {tableSeats.map((seat) => {
                    const { dx, dy } = seatOffset(resolveTableShape(el.shape), seat.t, el.w, el.h);
                    const Icon = FURNITURE_ICON[seat.furniture];
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        title={isSel ? `Click to remove this ${FURNITURE_LABEL[seat.furniture]}` : "Select the table to edit its chairs"}
                        style={{
                          position: "absolute",
                          left: `${50 + (dx / el.w) * 100}%`,
                          top: `${50 + (dy / el.h) * 100}%`,
                          transform: "translate(-50%,-50%)",
                          width: 26,
                          height: 26,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: seat.furniture === "chair" ? "50%" : 7,
                          background: "#33240F",
                          border: "1.5px solid rgba(232,184,92,.9)",
                          color: "#F2C879",
                          padding: 0,
                          cursor: isSel ? "pointer" : "inherit",
                          zIndex: 6,
                        }}
                        onPointerDown={(e) => { if (isSel) e.stopPropagation(); }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!isSel) { setSelected(el.id); return; }
                          removeSeatFromTable(el.id, seat.id);
                        }}
                      >
                        <Icon style={{ width: 15, height: 15 }} strokeWidth={2} />
                      </button>
                    );
                  })}

                  {/* Baby chairs offered at this table */}
                  {el.type === "table" && (el.babyChairs ?? 0) > 0 && (
                    <span
                      title={`${el.babyChairs} baby chair${el.babyChairs === 1 ? "" : "s"} available`}
                      style={{
                        position: "absolute",
                        bottom: -9,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "#1B2B3A",
                        border: "1px solid rgba(120,190,240,.7)",
                        color: "#9FD2F5",
                        borderRadius: 999,
                        padding: "1px 6px",
                        fontSize: 10,
                        lineHeight: 1.3,
                        whiteSpace: "nowrap",
                        pointerEvents: "none",
                        zIndex: 8,
                      }}
                    >
                      👶 ×{el.babyChairs}
                    </span>
                  )}
                </div>
              );
            })}

            {/* Empty state */}
            {elements.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="t-small text-center text-muted/40">
                  Click an element type on the left to start designing
                </p>
              </div>
            )}
          </div>

          <p className="t-micro mt-1.5 text-muted">
            Click to select · Drag to move · Drag corner ▪ to resize · Delete key removes the selected zone
          </p>

          {/* At-a-glance counts, so a host can see what the room offers. */}
          <div className="mt-3 flex flex-wrap gap-2" aria-label="Room summary">
            {[
              { icon: "👥", text: `${totalCap} capacity` },
              { icon: "🪑", text: `${facts.seats} chairs at ${facts.tables} table${facts.tables === 1 ? "" : "s"}` },
              { icon: "🚻", text: `${facts.restrooms} restroom${facts.restrooms === 1 ? "" : "s"} · ${facts.cubicles} cubicle${facts.cubicles === 1 ? "" : "s"}` },
              { icon: "🔊", text: `${facts.speakers} speaker${facts.speakers === 1 ? "" : "s"}` },
              { icon: "👶", text: `${facts.babyChairs} baby chair${facts.babyChairs === 1 ? "" : "s"}` },
            ].map((c) => (
              <span key={c.icon} className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12px] text-paper/80">
                <span aria-hidden="true">{c.icon}</span>
                {c.text}
              </span>
            ))}
          </div>

          {/* Legend */}
          {legend.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              {legend.map(({ type, count, capacity }) => {
                const p = PALETTE[type];
                return (
                  <div key={type} className="flex items-center gap-1.5 text-[12px]">
                    <span
                      style={{
                        width: 11,
                        height: 11,
                        flexShrink: 0,
                        background: p.bg,
                        border: "1px solid rgba(255,255,255,.18)",
                        borderRadius: p.round ? "50%" : 2,
                        display: "inline-block",
                      }}
                    />
                    <span className="text-paper/70">{p.label}</span>
                    <span className="text-muted">×{count}{capacity > 0 ? ` · ${capacity} seats` : ""}</span>
                  </div>
                );
              })}
              {totalCap > 0 && (
                <span className="ml-auto text-[12px]">
                  <span className="text-muted">Total capacity: </span>
                  <span className="t-mono font-semibold text-paper">{totalCap}</span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right properties panel */}
        <aside className="shrink-0 glass-soft rounded-xl lg:w-[248px]">
          <div className="border-b border-line px-3 py-2">
            <p className="t-micro">2 · Set it up</p>
          </div>

          {sel ? (
            <div className="flex flex-col gap-3 p-3">
              <div>
                <Label htmlFor="el-label" className="t-micro">Name</Label>
                <Input
                  id="el-label"
                  value={sel.label}
                  onChange={(e) => patch({ label: e.target.value })}
                  className="mt-1 h-8 text-[13px]"
                />
              </div>

              {sel.type === "restroom" && (
                <Stepper
                  label="Cubicles"
                  hint="How many people can use it at once."
                  value={sel.count ?? 1}
                  min={1}
                  max={40}
                  onChange={(n) => patch({ count: n })}
                />
              )}

              {sel.type === "speaker" && (
                <p className="t-micro text-muted">
                  The dashed ring shows how far the sound carries. Guests who book a table inside it are
                  told it's close to a speaker.
                </p>
              )}

              {!NON_BOOKABLE.includes(sel.type) && sel.type !== "table" && (
                <div>
                  <Label htmlFor="el-cap" className="t-micro">Capacity (0 = no limit)</Label>
                  <Input
                    id="el-cap"
                    type="number"
                    min={0}
                    value={sel.capacity}
                    onChange={(e) => patch({ capacity: Math.max(0, Number(e.target.value)) })}
                    className="mt-1 h-8 text-[13px]"
                  />
                </div>
              )}

              {sel.type === "table" && (
                <div className="flex flex-col gap-3 border-t border-line pt-3">
                  <div>
                    <p className="t-micro mb-1.5 text-muted">Quick sizes</p>
                    <div className="grid grid-cols-4 gap-1">
                      {[2, 4, 6, 8].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setChairCount(n)}
                          className={cn(
                            "rounded border px-1 py-1.5 text-[12px] transition-colors",
                            selSeats.length === n
                              ? "border-signal bg-signal/15 text-paper"
                              : "border-line text-paper/70 hover:bg-paper/5",
                          )}
                        >
                          For {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Stepper
                    label="Chairs"
                    hint={`${selSeats.length === 0 ? "No chairs yet — guests book the table as a whole." : seatBreakdown(selSeats)}`}
                    value={selSeats.length > 0 ? selSeats.filter((st) => st.groupId === null).length : 0}
                    min={0}
                    max={MAX_CHAIRS}
                    onChange={setChairCount}
                  />

                  <Stepper
                    label="Baby chairs"
                    hint="Optional, free. Guests with a little one can add one when they book this table."
                    icon={<Baby className="size-3.5" />}
                    value={sel.babyChairs ?? 0}
                    min={0}
                    max={MAX_BABY_CHAIRS}
                    onChange={(n) => patch({ babyChairs: n })}
                  />

                  <div>
                    <p className="t-micro mb-1.5 text-muted">Table shape</p>
                    <div className="grid grid-cols-3 gap-1">
                      {(["round", "square", "rectangle"] as TableShape[]).map((shape) => (
                        <button
                          key={shape}
                          type="button"
                          onClick={() => patch({ shape })}
                          className={cn(
                            "rounded border px-1 py-1 text-[11px] transition-colors",
                            selShape === shape
                              ? "border-signal bg-signal/15 text-paper"
                              : "border-line text-paper/70 hover:bg-paper/5",
                          )}
                        >
                          {shape === "round" ? "Round" : shape === "square" ? "Square" : "Rect."}
                        </button>
                      ))}
                    </div>
                  </div>

                  <details className="border-t border-line pt-3">
                    <summary className="t-micro cursor-pointer text-muted">Add a bench or sofa</summary>
                    <div className="mt-2 flex flex-col gap-1.5">
                      <select
                        value={groupFurniture}
                        onChange={(e) => setGroupFurniture(e.target.value as Furniture)}
                        className="field h-7 text-[12px]"
                      >
                        <option value="sofa">Sofa</option>
                        <option value="bench">Bench</option>
                      </select>
                      <div className="flex items-center gap-1.5">
                        <label className="t-micro shrink-0 text-muted">Seats</label>
                        <Input
                          type="number"
                          min={2}
                          max={6}
                          value={groupCount}
                          onChange={(e) => setGroupCount(clamp(Number(e.target.value), 2, 6))}
                          className="h-7 text-[12px]"
                        />
                      </div>
                      {selShape !== "round" && (
                        <select
                          value={groupSide}
                          onChange={(e) => setGroupSide(e.target.value as TableSide)}
                          className="field h-7 text-[12px]"
                        >
                          <option value="top">Top side</option>
                          <option value="right">Right side</option>
                          <option value="bottom">Bottom side</option>
                          <option value="left">Left side</option>
                        </select>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          setTableSeats(
                            addSeatGroup(selSeats, selShape, groupSide, groupCount, groupFurniture, {
                              w: sel.w,
                              h: sel.h,
                            }),
                          )
                        }
                      >
                        <Plus className="size-3" />
                        Add {FURNITURE_LABEL[groupFurniture]}
                      </Button>
                    </div>
                  </details>
                </div>
              )}

              <details className="border-t border-line pt-3">
                <summary className="t-micro cursor-pointer text-muted">Exact position & size (%)</summary>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {(["x", "y", "w", "h"] as const).map((k) => (
                    <div key={k}>
                      <label className="t-micro text-muted">{k.toUpperCase()}</label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(sel[k])}
                        onChange={(e) => patch({ [k]: Number(e.target.value) } as Partial<LE>)}
                        className="mt-0.5 h-7 text-[12px]"
                      />
                    </div>
                  ))}
                </div>
              </details>

              <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                <button
                  type="button"
                  onClick={duplicateSelected}
                  className="flex items-center justify-center gap-1.5 border border-line py-1.5 text-[13px] text-paper/80 transition-colors hover:bg-paper/5"
                >
                  <Copy className="size-3.5" />
                  Duplicate
                </button>
                <button
                  type="button"
                  onClick={deleteSelected}
                  className="flex items-center justify-center gap-1.5 border border-signal/30 py-1.5 text-[13px] text-signal transition-colors hover:bg-signal/10"
                >
                  <Trash2 className="size-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 p-3">
              <div className="flex items-center gap-2 text-muted">
                <Building2 className="size-5 shrink-0 text-muted/50" />
                <p className="t-small">Click anything on the canvas to edit it.</p>
              </div>
              <div className="border-t border-line pt-3">
                <p className="t-micro mb-2 text-muted">Is your room ready?</p>
                <ul className="flex flex-col gap-1">
                  {checklist.map((c) => (
                    <li key={c.key} className="flex items-center gap-2 text-[13px]">
                      {c.done ? (
                        <Check className="size-3.5 shrink-0 text-live" />
                      ) : (
                        <span className="size-3.5 shrink-0 rounded-full border border-line" />
                      )}
                      <span className={c.done ? "text-paper/60" : "text-paper/90"}>{c.label}</span>
                      {!c.done && (
                        <button
                          type="button"
                          onClick={() => addElement(c.add)}
                          className="ml-auto text-[12px] text-signal hover:underline"
                        >
                          Add
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <Button size="sm" onClick={() => setPreviewOpen(true)}>
                <Eye className="size-4" />
                3 · Preview as guest
              </Button>
            </div>
          )}
        </aside>
      </div>

      {/* ── Tips ── */}
      <div className="mt-5 glass-soft rounded-xl p-4">
        <p className="t-micro mb-2">Layout tips</p>
        <ul className="t-small space-y-1 text-muted">
          <li>· Put the <strong className="text-paper/80">Stage</strong> at the top — audience orientation is automatic</li>
          <li>· Tables start with four <strong className="text-paper/80">chairs</strong> — use the stepper to match your real furniture; each chair is booked individually</li>
          <li>· Mark where the <strong className="text-paper/80">restrooms</strong> and <strong className="text-paper/80">speakers</strong> are so guests can choose a quiet or lively spot</li>
          <li>· Offer <strong className="text-paper/80">baby chairs</strong> on family-friendly tables — guests add one for free when they book</li>
          <li>· Separate <strong className="text-paper/80">VIP</strong> areas map to premium ticket tiers in your event settings</li>
          <li>· Layout auto-saves every time you make a change</li>
        </ul>
      </div>

      {previewOpen && <GuestPreview elements={elements} onClose={() => setPreviewOpen(false)} />}
    </ConsoleShell>
  );
}

// ── Small controls ─────────────────────────────────────────────────────────────

function Stepper({
  label, hint, value, min, max, onChange, icon,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="t-micro flex items-center gap-1 text-muted">{icon}{label}</p>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Fewer ${label.toLowerCase()}`}
            disabled={value <= min}
            onClick={() => onChange(value - 1)}
            className="flex size-8 items-center justify-center rounded border border-line text-paper/80 hover:bg-paper/5 disabled:opacity-30"
          >
            <Minus className="size-3.5" />
          </button>
          <span className="t-mono w-7 text-center text-[14px] font-semibold" aria-live="polite">{value}</span>
          <button
            type="button"
            aria-label={`More ${label.toLowerCase()}`}
            disabled={value >= max}
            onClick={() => onChange(value + 1)}
            className="flex size-8 items-center justify-center rounded border border-line text-paper/80 hover:bg-paper/5 disabled:opacity-30"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      {hint && <p className="t-micro mt-1 text-muted">{hint}</p>}
    </div>
  );
}

// ── Guest preview ──────────────────────────────────────────────────────────────

/** The plan as the public API would serve it, so the preview runs the real guest UI. */
function toPreviewData(elements: LE[], showBooked: boolean): ZonesResponse {
  const zones: VenueZone[] = elements.map((e) => {
    const seats =
      e.type === "table"
        ? (e.seats ?? []).map((st, i) => ({
            id: st.id,
            t: st.t,
            furniture: st.furniture,
            groupId: st.groupId,
            label: `Seat ${i + 1}`,
            taken: showBooked && i % 3 === 1,
          }))
        : [];
    const capacity = seats.length > 0 ? seats.length : e.capacity;
    const bookable = !NON_BOOKABLE.includes(e.type) && capacity > 0;
    const taken = seats.length > 0
      ? seats.filter((st) => st.taken).length
      : showBooked && bookable ? Math.floor(capacity * 0.4) : 0;
    const baby = e.type === "table" ? e.babyChairs ?? 0 : 0;
    return {
      id: e.id,
      label: e.label,
      type: e.type,
      shape: e.type === "table" ? resolveTableShape(e.shape) : "round",
      x: e.x, y: e.y, w: e.w, h: e.h,
      capacity,
      bookable,
      taken,
      available: bookable ? Math.max(0, capacity - taken) : 0,
      seats,
      count: e.count ?? 0,
      baby_chairs_total: baby,
      baby_chairs_available: baby,
    };
  });
  const bookableZones = zones.filter((z) => z.bookable);
  return {
    event_id: "preview",
    venue_name: "Your venue",
    has_layout: zones.length > 0,
    bookable_count: bookableZones.length,
    places_available: bookableZones.reduce((n, z) => n + z.available, 0),
    zones,
  };
}

function GuestPreview({ elements, onClose }: { elements: LE[]; onClose: () => void }) {
  const [showBooked, setShowBooked] = useState(false);
  const [qty, setQty] = useState(2);
  const [zone, setZone] = useState<VenueZone | null>(null);
  const [seatIds, setSeatIds] = useState<string[]>([]);
  const [babyChairs, setBabyChairs] = useState(0);
  const data = useMemo(() => toPreviewData(elements, showBooked), [elements, showBooked]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const needsSeats = zone !== null && zone.seats.length > 0;
  const ready = zone !== null && (!needsSeats || seatIds.length === qty);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guest preview"
      className="fixed inset-0 z-[10000] flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-8"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] border border-line bg-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <p className="t-micro text-signal">Guest preview · nothing is booked</p>
            <p className="t-small text-muted">This is the seating step a guest sees at checkout.</p>
          </div>
          <button
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="flex size-9 items-center justify-center border border-line hover:bg-paper/5"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-4 py-3 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-muted">Guest is buying</span>
            <button type="button" aria-label="One fewer ticket" disabled={qty <= 1} onClick={() => setQty(qty - 1)}
              className="flex size-8 items-center justify-center border border-line disabled:opacity-40"><Minus className="size-3.5" /></button>
            <span className="t-mono w-5 text-center">{qty}</span>
            <button type="button" aria-label="One more ticket" disabled={qty >= 8} onClick={() => setQty(qty + 1)}
              className="flex size-8 items-center justify-center border border-line disabled:opacity-40"><Plus className="size-3.5" /></button>
            <span className="text-muted">ticket{qty === 1 ? "" : "s"}</span>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-muted">
            <input type="checkbox" className="size-4 accent-signal" checked={showBooked} onChange={(e) => setShowBooked(e.target.checked)} />
            Show some seats as already booked
          </label>
        </div>

        <div className="px-4 pb-4">
          <SeatPickerView
            phase="ready"
            data={data}
            retry={() => undefined}
            quantity={qty}
            value={zone}
            onChange={setZone}
            selectedSeatIds={seatIds}
            onSeatIdsChange={setSeatIds}
            babyChairs={babyChairs}
            onBabyChairsChange={setBabyChairs}
          />

          <Button className="mt-4 w-full" variant="primary" disabled>
            {ready || !needsSeats ? "Continue to payment (preview only)" : `Pick ${qty} seat${qty === 1 ? "" : "s"} to continue`}
          </Button>
          <Button className="mt-2 w-full" onClick={onClose}>Back to editing</Button>
        </div>
      </div>
    </div>
  );
}
