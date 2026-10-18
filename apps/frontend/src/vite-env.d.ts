/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_SENTRY_DSN?: string;
  /** Public Turnstile site key. Empty = bot check off. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  readonly VITE_ANALYTICS_KEY?: string;
  readonly VITE_ANALYTICS_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
