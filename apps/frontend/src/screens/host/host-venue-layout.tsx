import { useCallback, useEffect, useRef, useState } from "react";
import { Armchair, Building2, Grid3X3, RotateCcw, Save, Sofa, StretchHorizontal, Trash2, Plus } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { ApiError, getMyVenues, updateVenue, type ApiVenue } from "@/lib/api";
import { cn } from "@/lib/utils";
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
  | "bar" | "standing" | "vip" | "entrance" | "exit";

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
  table:       { label: "Table",         emoji: "⬤",  bg: "#2A1F10", fg: "#C89050", dw: 10, dh: 10, round: true  },
  dance_floor: { label: "Dance Floor",   emoji: "🕺", bg: "#0A0A2A", fg: "#8080F0", dw: 32, dh: 22, round: false },
  bar:         { label: "Bar / Counter", emoji: "🍺", bg: "#1F1008", fg: "#D07040", dw: 26, dh:  8, round: false },
  standing:    { label: "Standing Zone", emoji: "🧍", bg: "#141E14", fg: "#60B060", dw: 20, dh: 16, round: false },
  vip:         { label: "VIP Section",   emoji: "⭐", bg: "#1F0C1F", fg: "#C060C0", dw: 18, dh: 18, round: false },
  entrance:    { label: "Entrance",      emoji: "🚪", bg: "#0C1F0C", fg: "#50C050", dw: 12, dh:  7, round: false },
  exit:        { label: "Exit",          emoji: "🔴", bg: "#1F0C0C", fg: "#C05050", dw: 12, dh:  7, round: false },
};

// ── Default venue floor plan ───────────────────────────────────────────────────

const DEFAULT_LAYOUT: LE[] = [
  { id: "s1", type: "stage",       x: 33, y:  4, w: 34, h: 14, label: "Main Stage",  capacity: 0  },
  { id: "d1", type: "dance_floor", x: 28, y: 22, w: 44, h: 26, label: "Dance Floor", capacity: 80 },
  { id: "t1", type: "table",       x:  7, y: 30, w: 10, h: 10, label: "Table A",     capacity: 6  },
  { id: "t2", type: "table",       x: 19, y: 30, w: 10, h: 10, label: "Table B",     capacity: 6  },
  { id: "t3", type: "table",       x: 71, y: 30, w: 10, h: 10, label: "Table C",     capacity: 6  },
  { id: "t4", type: "table",       x: 83, y: 30, w: 10, h: 10, label: "Table D",     capacity: 6  },
  { id: "b1", type: "bar",         x:  4, y: 62, w: 26, h:  8, label: "Bar",         capacity: 0  },
  { id: "v1", type: "vip",         x: 72, y: 60, w: 22, h: 20, label: "VIP Section", capacity: 20 },
  { id: "e1", type: "entrance",    x: 44, y: 90, w: 12, h:  7, label: "Entrance",    capacity: 0  },
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
  const [fillCount, setFillCount] = useState(4);
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
    const el: LE = {
      id: uid(),
      type,
      x: clamp(50 - p.dw / 2, 0, 100 - p.dw),
      y: clamp(50 - p.dh / 2, 0, 100 - p.dh),
      w: p.dw,
      h: p.dh,
      label: p.label,
      capacity: 0,
    };
    setElements((prev) => [...prev, el]);
    setSelected(el.id);
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

  const totalCap = elements.reduce((s, e) => s + e.capacity, 0);

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
            Drag zones onto the canvas to map your venue. Attendees see this before booking so
            they know exactly where they'll be.
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
          <Button size="sm" variant="primary" onClick={save}>
            <Save className="size-4" />
            {savedMsg ? "Saved ✓" : "Save layout"}
          </Button>
        </div>
      </div>

      {/* ── Three-column editor ── */}
      <div className="flex gap-3" style={{ minHeight: 500 }}>

        {/* Left toolbar */}
        <aside className="w-[148px] shrink-0 border border-line bg-surface">
          <div className="border-b border-line px-3 py-2">
            <p className="t-micro">Add element</p>
          </div>
          <div className="flex flex-col gap-0.5 p-2">
            {(Object.keys(PALETTE) as EType[]).map((type) => {
              const p = PALETTE[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => addElement(type)}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-surface-2"
                >
                  <span className="text-[15px] leading-none">{p.emoji}</span>
                  <span className="truncate text-paper/80">{p.label}</span>
                  <Plus className="ml-auto size-3 shrink-0 text-muted" />
                </button>
              );
            })}
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
                  </span>
                  {el.capacity > 0 && (
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
                  {/* Resize handle — only on non-round selected elements */}
                  {isSel && !isRoundVisual && (
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

                  {/* Seat markers — click one to remove it. Building up a
                      table's seats is done via the sub-panel actions on the
                      right, not by editing markers here. */}
                  {tableSeats.map((seat) => {
                    const { dx, dy } = seatOffset(resolveTableShape(el.shape), seat.t, el.w, el.h);
                    const Icon = FURNITURE_ICON[seat.furniture];
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        title={`Remove this ${FURNITURE_LABEL[seat.furniture]} seat`}
                        style={{
                          position: "absolute",
                          left: `${50 + (dx / el.w) * 100}%`,
                          top: `${50 + (dy / el.h) * 100}%`,
                          transform: "translate(-50%,-50%)",
                          width: 15,
                          height: 15,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          background: "#20160A",
                          border: "1px solid rgba(232,184,92,.75)",
                          color: "#E8B85C",
                          padding: 0,
                          cursor: "pointer",
                          zIndex: 6,
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected(el.id);
                          removeSeatFromTable(el.id, seat.id);
                        }}
                      >
                        <Icon style={{ width: 9, height: 9 }} strokeWidth={2.25} />
                      </button>
                    );
                  })}
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
            Click to select · Drag to move · Drag corner ▪ to resize · Click canvas to deselect
          </p>

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
        <aside className="w-[228px] shrink-0 border border-line bg-surface">
          <div className="border-b border-line px-3 py-2">
            <p className="t-micro">Properties</p>
          </div>

          {sel ? (
            <div className="flex flex-col gap-3 p-3">
              <div>
                <Label htmlFor="el-label" className="t-micro">Zone name</Label>
                <Input
                  id="el-label"
                  value={sel.label}
                  onChange={(e) => patch({ label: e.target.value })}
                  className="mt-1 h-8 text-[13px]"
                />
              </div>

              <div>
                <Label htmlFor="el-cap" className="t-micro">
                  {selSeats.length > 0 ? "Capacity (from seats)" : "Capacity (0 = no limit)"}
                </Label>
                <Input
                  id="el-cap"
                  type="number"
                  min={0}
                  value={sel.capacity}
                  readOnly={selSeats.length > 0}
                  disabled={selSeats.length > 0}
                  onChange={(e) => patch({ capacity: Math.max(0, Number(e.target.value)) })}
                  className="mt-1 h-8 text-[13px]"
                />
                {selSeats.length > 0 && (
                  <p className="t-micro mt-1 text-muted">
                    This table has seats, so capacity follows the seat count — edit seats below.
                  </p>
                )}
              </div>

              {sel.type === "table" && (
                <div className="border-t border-line pt-3">
                  <p className="t-micro mb-2 text-muted">Table shape</p>
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
                            : "border-line text-paper/70 hover:bg-surface-2",
                        )}
                      >
                        {shape === "round" ? "Round" : shape === "square" ? "Square" : "Rect."}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <p className="t-micro text-muted">Seats</p>
                    <p className="t-micro text-paper/70">{seatBreakdown(selSeats)}</p>
                  </div>

                  <div className="mt-2 flex items-end gap-1.5">
                    <div className="flex-1">
                      <label className="t-micro text-muted">Chairs</label>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        value={fillCount}
                        onChange={(e) => setFillCount(Math.max(0, Number(e.target.value)))}
                        className="mt-0.5 h-7 text-[12px]"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[11px]"
                      onClick={() => setTableSeats(autoGenerateSeats(selShape, fillCount, "chair"))}
                    >
                      Fill
                    </Button>
                  </div>
                  <p className="t-micro mt-1 text-muted">Replaces all seats with evenly spaced chairs.</p>

                  <div className="mt-3 border-t border-line pt-3">
                    <p className="t-micro mb-1.5 text-muted">Add a bench or sofa</p>
                    <div className="flex flex-col gap-1.5">
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
                    {selShape === "round" && (
                      <p className="t-micro mt-1 text-muted">
                        Round tables place new seats right after the last one — no side to pick.
                      </p>
                    )}
                  </div>

                  {selSeats.length > 0 && (
                    <p className="t-micro mt-3 text-muted">
                      Click a seat marker on the table to remove it.
                    </p>
                  )}
                </div>
              )}

              <div className="border-t border-line pt-3">
                <p className="t-micro mb-2 text-muted">Position & size (%)</p>
                <div className="grid grid-cols-2 gap-1.5">
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
              </div>

              <div className="border-t border-line pt-3">
                <p className="t-micro mb-1 text-muted">Type</p>
                <p className="text-[13px] text-paper/70">
                  {PALETTE[sel.type].emoji} {PALETTE[sel.type].label}
                </p>
              </div>

              <button
                type="button"
                onClick={deleteSelected}
                className="flex w-full items-center justify-center gap-1.5 border border-signal/30 py-1.5 text-[13px] text-signal transition-colors hover:bg-signal/10"
              >
                <Trash2 className="size-3.5" />
                Delete zone
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center" style={{ minHeight: 200 }}>
              <Building2 className="size-8 text-muted/30" />
              <p className="t-small text-muted/50">
                Select a zone on the canvas to edit its name and capacity
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* ── Tips ── */}
      <div className="mt-5 border border-line bg-surface p-4">
        <p className="t-micro mb-2">Layout tips</p>
        <ul className="t-small space-y-1 text-muted">
          <li>· Put the <strong className="text-paper/80">Stage</strong> at the top — audience orientation is automatic</li>
          <li>· Add a <strong className="text-paper/80">capacity</strong> to each zone — Naada will use this to cap ticket sales per section</li>
          <li>· Separate <strong className="text-paper/80">VIP</strong> areas map to premium ticket tiers in your event settings</li>
          <li>· Layout auto-saves every time you make a change</li>
        </ul>
      </div>
    </ConsoleShell>
  );
}
