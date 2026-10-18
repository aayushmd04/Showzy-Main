import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTurnstile, turnstileEnabled } from "./turnstile";

type Options = Record<string, (...a: unknown[]) => void> & { sitekey: string; action: string };

function installWidget() {
  const state = { options: undefined as Options | undefined };
  const api = {
    render: vi.fn((_el: HTMLElement, options: Options) => {
      state.options = options;
      return "widget-1";
    }),
    execute: vi.fn(),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  window.turnstile = api;
  return { api, state };
}

describe("turnstile", () => {
  beforeEach(() => vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key"));
  afterEach(() => {
    delete window.turnstile;
    vi.unstubAllEnvs();
  });

  it("is off without a site key", () => {
    vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "");
    expect(turnstileEnabled()).toBe(false);
  });

  it("renders once with the sign-in action and resolves the token from the callback", async () => {
    const { api, state } = installWidget();
    const handle = createTurnstile(document.createElement("div"));

    const first = handle.getToken();
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    expect(state.options).toMatchObject({
      sitekey: "site-key",
      action: "request-otp",
      appearance: "interaction-only",
    });
    state.options!.callback("token-1");
    await expect(first).resolves.toBe("token-1");
  });

  it("resets and re-executes the same widget for the next token", async () => {
    const { api, state } = installWidget();
    const handle = createTurnstile(document.createElement("div"));

    const first = handle.getToken();
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(1));
    state.options!.callback("token-1");
    await first;

    const second = handle.getToken();
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalledTimes(2));
    expect(api.render).toHaveBeenCalledTimes(1);
    expect(api.reset).toHaveBeenCalledWith("widget-1");
    state.options!.callback("token-2");
    await expect(second).resolves.toBe("token-2");
  });

  it("rejects when Cloudflare reports an error", async () => {
    const { api, state } = installWidget();
    const handle = createTurnstile(document.createElement("div"));
    const p = handle.getToken();
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalled());
    state.options!["error-callback"]();
    await expect(p).rejects.toThrow("Security check failed");
  });

  it("destroy() removes the widget and rejects anything still waiting", async () => {
    const { api } = installWidget();
    const handle = createTurnstile(document.createElement("div"));
    const p = handle.getToken();
    await vi.waitFor(() => expect(api.execute).toHaveBeenCalled());
    handle.destroy();
    await expect(p).rejects.toThrow("Closed");
    expect(api.remove).toHaveBeenCalledWith("widget-1");
  });
});
