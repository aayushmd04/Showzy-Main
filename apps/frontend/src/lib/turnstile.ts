/**
 * Cloudflare Turnstile, loaded on demand.
 *
 * The widget runs invisibly (`interaction-only`): most people never see it and
 * it only shows a checkbox if Cloudflare is unsure. A token is single-use, so
 * every request that needs one asks for a fresh token with `getToken()`, which
 * resets and re-executes the same widget.
 *
 * With no `VITE_TURNSTILE_SITE_KEY` the whole thing is off and callers get
 * `undefined`; the server decides whether that is acceptable (it is not in
 * production once TURNSTILE_SECRET_KEY is set).
 */

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const ACTION = "request-otp";
const SCRIPT_TIMEOUT_MS = 10_000;
/** Long enough for a person to tick an interactive challenge. */
const TOKEN_TIMEOUT_MS = 45_000;

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widgetId: string): void;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const siteKey = (): string => import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
export const turnstileEnabled = (): boolean => siteKey() !== "";

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadScript(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const fail = (message: string) => {
      scriptPromise = null; // let a later attempt retry
      reject(new Error(message));
    };
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : fail("Security check unavailable");
    script.onerror = () => fail("Couldn't load the security check");
    document.head.appendChild(script);
    window.setTimeout(() => fail("Security check timed out"), SCRIPT_TIMEOUT_MS);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** A fresh single-use token. Rejects if the check fails or times out. */
  getToken(): Promise<string>;
  destroy(): void;
}

export function createTurnstile(container: HTMLElement): TurnstileHandle {
  let widgetId: string | null = null;
  let pending: { resolve: (t: string) => void; reject: (e: Error) => void } | null = null;

  const settle = (fn: (p: NonNullable<typeof pending>) => void) => {
    const p = pending;
    pending = null;
    if (p) fn(p);
  };

  return {
    async getToken() {
      const api = await loadScript();
      // A second call while one is in flight supersedes it.
      settle((p) => p.reject(new Error("Superseded")));

      return new Promise<string>((resolve, reject) => {
        pending = { resolve, reject };
        const timer = window.setTimeout(
          () => settle((p) => p.reject(new Error("Security check timed out"))),
          TOKEN_TIMEOUT_MS,
        );
        const done = <T extends unknown[]>(fn: (...a: T) => void) =>
          (...a: T) => { window.clearTimeout(timer); fn(...a); };

        const callbacks = {
          callback: done((token: string) => settle((p) => p.resolve(token))),
          "error-callback": done(() => settle((p) => p.reject(new Error("Security check failed")))),
          "timeout-callback": done(() => settle((p) => p.reject(new Error("Security check timed out")))),
          "expired-callback": () => { /* the next getToken() resets anyway */ },
        };

        if (widgetId === null) {
          widgetId = api.render(container, {
            sitekey: siteKey(),
            action: ACTION,
            appearance: "interaction-only",
            execution: "execute",
            ...callbacks,
          });
        } else {
          api.reset(widgetId);
        }
        api.execute(widgetId);
      });
    },

    destroy() {
      settle((p) => p.reject(new Error("Closed")));
      if (widgetId !== null && window.turnstile) window.turnstile.remove(widgetId);
      widgetId = null;
    },
  };
}
