import type { ReactNode } from "react";

/**
 * One consent checkbox, used wherever we ask for an agreement. Unticked by
 * default and never pre-ticked: consent has to be an action. Links inside open
 * in a new tab so reading the policy never loses the form.
 */
export function ConsentCheck({
  id,
  checked,
  onChange,
  children,
  className = "",
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label htmlFor={id} className={`flex cursor-pointer items-start gap-3 border border-line p-3 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-[#FF3D6E]"
        required
      />
      <span className="t-small text-paper/90">{children}</span>
    </label>
  );
}

/** A policy link that opens in a new tab. */
export function PolicyLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <a href={to} target="_blank" rel="noopener noreferrer" className="link-underline text-paper">
      {children}
    </a>
  );
}
