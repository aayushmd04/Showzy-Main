/**
 * Shared building blocks for the signed-in role home pages.
 *
 * Typography note: the console screens use the `t-h1`/`t-small`/`t-mono` type
 * classes. Those utilities are currently missing from src/styles/globals.css
 * (a regression — every console screen is affected), so each constant below
 * carries the class name *and* the exact declarations it stands for. When the
 * utility layer comes back the two agree, so nothing shifts either way.
 *
 * Colour comes from the CSS tokens only (`bg-surface`, `text-paper`,
 * `text-muted`, `border-line`, `text-gold`), so both themes are correct.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { actionError } from "@/components/naada/api-message";

/* ── Type scale ─────────────────────────────────────────────────────────── */

export const T_H1 = "t-h1";
export const T_H2 =
  "font-megrim text-[clamp(22px,3vw,32px)] font-normal uppercase leading-tight tracking-[0.02em]";
export const T_H3 = "t-h3 font-display text-[17px] font-bold leading-[1.3]";
export const T_BODY = "t-body text-[15px] leading-[1.55]";
export const T_SMALL = "t-small text-[13px] leading-[1.5]";
export const T_MONO = "tabular-nums font-semibold";
export const T_MICRO = "text-[13px] font-medium leading-[1.4] text-muted";

/* ── Async data ─────────────────────────────────────────────────────────── */

export interface Async<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Run one API call and expose loading / error / data for it.
 *
 * `action` completes the sentence "couldn't <action>", so a failed section can
 * say what it failed at instead of showing a bare spinner forever.
 * Pass a `useCallback`-stable `fn`.
 */
export function useAsync<T>(fn: () => Promise<T>, action: string): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn()
      .then((result) => {
        if (!live) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!live) return;
        setError(actionError(err, action));
        setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [fn, action, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload };
}

/* ── Layout ─────────────────────────────────────────────────────────────── */

export function HomeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1600px] px-[var(--page-pad)] py-8 md:py-10">{children}</div>
  );
}

export function HomeHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  actions: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-2">
      <div className="min-w-0">
        <p className={T_MICRO}>{kicker}</p>
        <h1 className={`${T_H1} mt-1 text-paper`}>{title}</h1>
        <p className={`${T_SMALL} mt-2 text-muted`}>{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </header>
  );
}

export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: { to: string; label: string };
  children: ReactNode;
}) {
  return (
    <section className="mt-10 md:mt-12">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className={`${T_H2} text-paper`}>{title}</h2>
        {action && (
          <Link
            to={action.to}
            className={`${T_SMALL} text-muted underline-offset-4 transition-colors hover:text-paper hover:underline`}
          >
            {action.label} →
          </Link>
        )}
      </div>
      {hint && <p className={`${T_SMALL} mt-1 max-w-[64ch] text-muted`}>{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A count tile: the number is the content, the label says what it counts. */
export function CountTile({
  value,
  label,
  to,
  tone,
}: {
  value: string;
  label: string;
  to: string;
  tone?: "gold" | "signal";
}) {
  return (
    <Link
      to={to}
      className="glass-soft block rounded-xl p-5 transition-transform duration-300 hover:-translate-y-0.5"
    >
      <p
        className={`${T_MONO} text-[clamp(28px,3vw,38px)] leading-none ${
          tone === "gold" ? "text-gold" : tone === "signal" ? "text-signal" : "text-paper"
        }`}
      >
        {value}
      </p>
      <p className={`${T_MICRO} mt-2.5`}>{label}</p>
    </Link>
  );
}

/* ── States ─────────────────────────────────────────────────────────────── */

export function LoadingBlock({ label }: { label: string }) {
  return (
    <p
      role="status"
      className={`${T_SMALL} glass-soft rounded-xl border-dashed px-4 py-8 text-center text-muted`}
    >
      {label}
    </p>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="glass-soft rounded-xl px-4 py-6 text-center">
      <p className={`${T_SMALL} text-fault`} role="alert">
        {message}
      </p>
      <button type="button" onClick={onRetry} className="btn btn-secondary mt-4">
        Try again
      </button>
    </div>
  );
}

/** Empty state that says what to do next, not that there is nothing. */
export function EmptyBlock({
  headline,
  body,
  to,
  actionLabel,
}: {
  headline: string;
  body: string;
  to?: string;
  actionLabel?: string;
}) {
  return (
    <div className="glass-soft flex flex-col items-center rounded-xl border-dashed px-6 py-12 text-center">
      <h3 className={`${T_H3} max-w-[30ch] text-paper`}>{headline}</h3>
      <p className={`${T_BODY} mt-2 max-w-[46ch] text-muted`}>{body}</p>
      {to && actionLabel && (
        <Link to={to} className="btn btn-secondary mt-5">
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/**
 * One wrapper for the four states a data-backed section can be in, so no
 * section can accidentally ship without an error or an empty case.
 */
export function AsyncSection<T>({
  state,
  loadingLabel,
  isEmpty,
  empty,
  children,
}: {
  state: Async<T>;
  loadingLabel: string;
  isEmpty: (data: T) => boolean;
  empty: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (state.loading) return <LoadingBlock label={loadingLabel} />;
  if (state.error) return <ErrorBlock message={state.error} onRetry={state.reload} />;
  if (!state.data || isEmpty(state.data)) return <>{empty}</>;
  return <>{children(state.data)}</>;
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

const DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** `THU 12 SEP · 21:48` from an API datetime, in the reader's own timezone. */
export function stampDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${day} · ${time}`;
}

/** `THU 12 SEP` from either a date or a datetime. */
export function stampDate(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${DAYS[d.getDay()]} ${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()]}`;
}

export function rupees(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return "₹" + Math.round(n).toLocaleString("en-IN");
}

/**
 * A budget the host actually published, or null. Never invent a range: an
 * event with no budget set says so rather than showing ₹0.
 */
export function budgetRange(
  min: string | null | undefined,
  max: string | null | undefined,
): string | null {
  const lo = rupees(min);
  const hi = rupees(max);
  if (lo && hi) return lo === hi ? lo : `${lo}–${hi}`;
  return lo ?? hi;
}

export function isFuture(iso: string): boolean {
  const d = new Date(iso.length <= 10 ? `${iso}T23:59:59` : iso);
  return !Number.isNaN(d.getTime()) && d.getTime() >= Date.now();
}

export function placeLine(...parts: Array<string | null | undefined>): string {
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(" · ");
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}
