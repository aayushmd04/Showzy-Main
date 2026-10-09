/**
 * Switch between light and dark as a cross-fade, never a cut.
 *
 * Every colour on the site comes from CSS variables on the root element, so
 * flipping one class changes the whole page at once. Where the browser
 * supports the View Transitions API we let it take a picture of the old page,
 * flip the class, and fade the picture into the new page; that fades
 * everything, gradients and photos included. Elsewhere we fall back to
 * transitioning the colour properties, which covers text, borders and fills.
 * People who ask for reduced motion get the instant switch.
 */
type Theme = "dark" | "light";

const FADE_MS = 450;

export function switchTheme(next: Theme, setTheme: (t: Theme) => void): void {
  const root = document.documentElement;

  const apply = () => {
    // Flip the class straight away so the new look exists when the browser
    // takes its "after" picture; the store's own effect then agrees with it.
    root.classList.toggle("theme-light", next === "light");
    root.style.colorScheme = next;
    setTheme(next);
  };

  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return apply();

  const withTransition = (document as Document & { startViewTransition?: (cb: () => void) => unknown })
    .startViewTransition;
  if (typeof withTransition === "function") {
    withTransition.call(document, apply);
    return;
  }

  root.classList.add("theme-fading");
  apply();
  window.setTimeout(() => root.classList.remove("theme-fading"), FADE_MS + 50);
}
