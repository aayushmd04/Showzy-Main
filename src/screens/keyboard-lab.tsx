import { Link } from "react-router-dom";
import { Component as VintageKeyboard } from "@/components/ui/vintage-keyboard";

/**
 * Component lab route. Not part of the Naada product surface — it hosts the
 * shadcn-style component in `components/ui` so it can be exercised in isolation.
 */
export function KeyboardLabScreen() {
  return (
    <div className="min-h-dvh bg-[#FAFAFA]">
      <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 px-4 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#8a8a8e]">
          component lab · vintage-keyboard
        </p>
        <Link
          to="/"
          className="border border-[#e4e4e7] bg-white px-3 py-2 text-[13px] text-[#3f3f46] hover:bg-[#f4f4f5]"
        >
          Back to Naada
        </Link>
      </div>
      <VintageKeyboard />
    </div>
  );
}
