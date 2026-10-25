/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
  readonly VITE_SENTRY_DSN_FRONTEND?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SENTRY_RELEASE?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  /** Public Turnstile site key. Empty = bot check off. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
  /** Public Google OAuth client ID. Empty = "Continue with Google" hidden. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ANALYTICS_KEY?: string;
  readonly VITE_ANALYTICS_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
