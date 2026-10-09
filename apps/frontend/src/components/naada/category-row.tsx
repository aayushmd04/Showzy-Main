import { LayoutGrid } from "lucide-react";

import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { useStore } from "@/store/app-store";

/**
 * Five round art-form icons plus "See all". Tapping an art form filters the page;
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

  return (
    <nav
      aria-label={kn ? "ವರ್ಗಗಳು" : "Categories"}
      className="relative z-10 -mx-[var(--page-pad)] flex justify-between gap-1 overflow-x-auto px-[var(--page-pad)] sm:gap-2 md:mx-0 md:justify-start md:gap-8 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {CATEGORIES.map(({ id, label, labelKn, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? null : id)}
            className="group relative z-10 flex min-w-[50px] flex-1 flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal md:min-w-[76px] md:flex-none"
          >
            <span
              className={`grid size-11 sm:size-12 place-items-center rounded-full border transition-colors md:size-14 ${
                active
                  ? "border-signal bg-signal text-white"
                  : "glass text-paper group-hover:border-white/40"
              }`}
            >
              <Icon className="size-5 md:size-6" aria-hidden />
            </span>
            <span className={`text-[13px] font-semibold drop-shadow ${active ? "text-paper" : "text-paper/80 group-hover:text-paper"}`}>
              {kn ? labelKn : label}
            </span>
          </button>
        );
      })}

      <button
        type="button"
        onClick={onSeeAll}
        className="group relative z-10 flex min-w-[50px] flex-1 flex-col items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal md:min-w-[76px] md:flex-none"
      >
        <span className="glass grid size-11 place-items-center rounded-full border-dashed text-signal transition-colors group-hover:border-signal sm:size-12 md:size-14">
          <LayoutGrid className="size-5 md:size-6" aria-hidden />
        </span>
        <span className="text-[13px] font-semibold text-signal drop-shadow">{kn ? "ಎಲ್ಲವನ್ನೂ ನೋಡಿ" : "See all"}</span>
      </button>
    </nav>
  );
}
