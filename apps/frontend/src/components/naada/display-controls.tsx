import { KANNADA_ENABLED } from "@/lib/features";
import { Moon, Sun } from "lucide-react";

import { useStore } from "@/store/app-store";
import { switchTheme } from "@/lib/theme-transition";

/**
 * The two display switches every signed-in or signed-out screen needs: light or
 * dark, and English or Kannada. They live here so the public site and the
 * consoles carry exactly the same controls.
 */

/** A bare sun/moon icon button. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useStore();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={() => switchTheme(light ? "dark" : "light", setTheme)}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      className={`size-9 shrink-0 place-items-center rounded-full text-paper/80 transition-colors hover:bg-paper/10 hover:text-paper ${className || "grid"}`}
    >
      {light ? <Moon className="size-[17px]" aria-hidden /> : <Sun className="size-[17px]" aria-hidden />}
    </button>
  );
}

/** "EN / ಕನ್ನಡ", with the current language in full strength. */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { lang, setLang } = useStore();
  const kn = lang === "kn";
  if (!KANNADA_ENABLED) return null;
  return (
    <button
      type="button"
      onClick={() => setLang(kn ? "en" : "kn")}
      aria-label="Change language"
      className={`min-h-9 whitespace-nowrap text-[13px] font-semibold ${className}`}
    >
      <span className={kn ? "text-muted" : "text-paper"}>EN</span>
      <span className="mx-1 text-muted">/</span>
      <span className={kn ? "text-paper" : "text-muted"}>ಕನ್ನಡ</span>
    </button>
  );
}
