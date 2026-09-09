import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Grid3X3, RotateCcw, Save, Trash2, Plus } from "lucide-react";
import { ConsoleShell, HOST_NAV } from "@/components/naada/console-shell";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

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
}

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

let _counter = 0;
function uid() { return `el_${Date.now()}_${++_counter}`; }
function snap(v: number, on: boolean) { return on ? Math.round(v / 2.5) * 2.5 : v; }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

const STORAGE_KEY = "naada_venue_layout";

// ── Screen ────────────────────────────────────────────────────────────────────

export function HostVenueLayoutScreen() {
  const [elements, setElements] = useState<LE[]>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      return s ? JSON.parse(s) : DEFAULT_LAYOUT;
    } catch {
      return DEFAULT_LAYOUT;
    }
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [gridOn, setGridOn] = useState(true);
  const [savedMsg, setSavedMsg] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const gridRef = useRef(gridOn);
  useEffect(() => { gridRef.current = gridOn; }, [gridOn]);

  const sel = elements.find((e) => e.id === selected) ?? null;

  // ── Persistence ──────────────────────────────────────────────────────────────

  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(elements));
    } catch { /* storage full */ }
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2200);
  }, [elements]);

  // Auto-save on change
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(elements)); } catch { /* ignore */ }
    }, 800);
    return () => clearTimeout(t);
  }, [elements]);

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
                    borderRadius: p.round ? "50%" : 3,
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
                  {isSel && !p.round && (
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
        <aside className="w-[192px] shrink-0 border border-line bg-surface">
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
