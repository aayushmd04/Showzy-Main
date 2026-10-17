import { LayoutGrid } from "lucide-react";

import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { useStore } from "@/store/app-store";

/**
 * Art forms as outlined pills with an icon and a label, in the theme's own colours:
 * ivory outline, red icon, red fill when chosen. Tapping one filters the page;
 * tapping it again clears it. "See all" clears any filter and shows everything.
 */
export function CategoryRow({
  value,
  onChange,
  onSeeAll,
}: {
  value: CategoryId | null;
  onChange: (id: CategoryId | null) => void;
  onSeeAll: () => void;
}) {
  const { lang } = useStore();
  const kn = lang === "kn";
  const pill =
    "group relative z-10 inline-flex min-h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-full border-2 pl-3 pr-5 text-[15px] font-extrabold tracking-tight transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal md:min-h-[52px]";

  return (
    <nav
      aria-label={kn ? "ವರ್ಗಗಳು" : "Categories"}
      className="relative z-10 -mx-[var(--page-pad)] flex gap-2.5 overflow-x-auto px-[var(--page-pad)] py-2 [scrollbar-width:none] md:mx-0 md:flex-wrap md:gap-3 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {CATEGORIES.map(({ id, label, labelKn, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : id)}
            className={`${pill} ${
              active
                ? "border-signal bg-signal text-[#F3E9D6]"
                : "border-[var(--glass-border)] bg-[var(--glass-bg-soft)] text-paper hover:border-signal"
            }`}
          >
            <span
              className={`grid size-8 place-items-center rounded-full transition-colors ${
                active ? "bg-[#F3E9D6]/20" : "bg-signal/15 group-hover:bg-signal/25"
              }`}
            >
              <Icon className={`size-[18px] ${active ? "text-[#F3E9D6]" : "text-signal"}`} strokeWidth={2} aria-hidden />
            </span>
            {kn ? labelKn : label}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onSeeAll}
        className={`${pill} border-dashed border-[var(--glass-border)] pr-4 text-signal hover:border-signal`}
      >
        <LayoutGrid className="size-[18px]" strokeWidth={2} aria-hidden />
        {kn ? "ಎಲ್ಲವನ್ನೂ ನೋಡಿ" : "See all"}
      </button>
    </nav>
  );
}
