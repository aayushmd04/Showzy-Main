import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

interface Colors {
  paper: string;
  signal: string;
  border: string;
  surface: string;
}

interface Props {
  value: string;
  options: string[];
  label: (value: string) => string;
  onChange: (value: string) => void;
  colors: Colors;
  /** Smaller pill for the mobile strip. */
  compact?: boolean;
  ariaLabel: string;
}

/**
 * City picker as a real dropdown. The list is portalled to <body> and
 * positioned from the button's rect, because the mobile strip it sits in
 * scrolls horizontally and would clip an in-flow menu.
 */
export function CityDropdown({ value, options, label, onChange, colors, compact, ariaLabel }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; minWidth: number }>({ top: 0, left: 0, minWidth: 0 });
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const selected = value !== "all";

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 190);
    setPos({
      top: r.bottom + 6,
      left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8),
      minWidth: width,
    });
  }, []);

  const show = () => {
    place();
    setActive(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    btn.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!list.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    list.current?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btn.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={`${ariaLabel}: ${label(value)}`}
        onClick={() => (open ? setOpen(false) : show())}
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? 6 : 7,
          flexShrink: 0,
          minHeight: compact ? 38 : 44,
          padding: compact ? "0 12px 0 14px" : "0 13px 0 15px",
          borderRadius: 999,
          fontSize: compact ? 14 : 15,
          fontWeight: 600,
          fontFamily: "'Jost',sans-serif",
          whiteSpace: "nowrap",
          color: colors.paper,
          cursor: "pointer",
          border: `${compact ? 1 : 1.5}px solid ${selected ? colors.signal : colors.border}`,
          background: selected ? `${colors.signal}18` : "transparent",
        }}
      >
        <span style={{ fontSize: compact ? 12 : 13, color: colors.signal }}>◎</span>
        <span>{label(value)}</span>
        <ChevronDown
          aria-hidden
          size={compact ? 14 : 16}
          style={{ transition: "transform .15s", transform: open ? "rotate(180deg)" : "none", opacity: 0.8 }}
        />
      </button>

      {open &&
        createPortal(
          <ul
            ref={list}
            id={id}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            aria-activedescendant={`${id}-${active}`}
            onKeyDown={onListKey}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: pos.minWidth,
              zIndex: 1000,
              margin: 0,
              padding: 6,
              listStyle: "none",
              background: colors.surface,
              border: `1px solid ${colors.border}`,
              borderRadius: 12,
              boxShadow: "0 14px 40px rgba(0,0,0,.45)",
              outline: "none",
              fontFamily: "'Jost',sans-serif",
            }}
          >
            {options.map((o, i) => (
              <li
                key={o}
                id={`${id}-${i}`}
                role="option"
                aria-selected={o === value}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(o)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  minHeight: 44,
                  padding: "0 12px",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: o === value ? 700 : 500,
                  color: colors.paper,
                  cursor: "pointer",
                  background: i === active ? `${colors.signal}22` : "transparent",
                }}
              >
                <span>{label(o)}</span>
                {o === value && <Check aria-hidden size={16} style={{ color: colors.signal }} />}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </>
  );
}
