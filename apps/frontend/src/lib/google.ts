/**
 * Google sign-in ("Continue with Google"), loaded on demand.
 *
 * Google's own button hands back an ID token (a signed JWT) in `callback`; the
 * server verifies it (`POST /auth/google/`). There is no client secret and no
 * redirect: the client ID below is public and the whole exchange happens in a
 * popup. With no `VITE_GOOGLE_CLIENT_ID` the feature is off and the sheet shows
 * email sign-in only.
 */

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
const SCRIPT_TIMEOUT_MS = 10_000;

interface GsiButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill";
  logo_alignment?: "left" | "center";
  width?: number;
}

interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    use_fedcm_for_prompt?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdApi } };
  }
}

export const googleClientId = (): string => import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const googleEnabled = (): boolean => googleClientId() !== "";

let scriptPromise: Promise<GoogleIdApi> | null = null;

function loadScript(): Promise<GoogleIdApi> {
  const ready = window.google?.accounts?.id;
  if (ready) return Promise.resolve(ready);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<GoogleIdApi>((resolve, reject) => {
    const fail = (message: string) => {
      scriptPromise = null; // let a later attempt retry
      reject(new Error(message));
    };
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      return api ? resolve(api) : fail("Google sign-in unavailable");
    };
    script.onerror = () => fail("Couldn't load Google sign-in");
    document.head.appendChild(script);
    window.setTimeout(() => fail("Google sign-in timed out"), SCRIPT_TIMEOUT_MS);
  });
  return scriptPromise;
}

/**
 * Draw Google's button in `container`. `onCredential` receives the ID token the
 * moment the user finishes choosing an account. Rejects if the script can't be
 * loaded (ad-blocker, offline); the caller should just leave email sign-in.
 */
export async function renderGoogleButton(
  container: HTMLElement,
  onCredential: (credential: string) => void,
  options: GsiButtonOptions = {},
): Promise<void> {
  const api = await loadScript();
  api.initialize({
    client_id: googleClientId(),
    callback: (response) => {
      if (response.credential) onCredential(response.credential);
    },
  });
  api.renderButton(container, {
    type: "standard",
    theme: "filled_black",
    size: "large",
    text: "continue_with",
    shape: "rectangular",
    logo_alignment: "left",
    ...options,
  });
}
