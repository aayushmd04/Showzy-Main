import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { googleEnabled, renderGoogleButton } from "./google";

function installGoogle() {
  const state = { callback: undefined as ((r: { credential?: string }) => void) | undefined };
  const api = {
    initialize: vi.fn((cfg: { callback: (r: { credential?: string }) => void }) => {
      state.callback = cfg.callback;
    }),
    renderButton: vi.fn(),
  };
  window.google = { accounts: { id: api } };
  return { api, state };
}

describe("google sign-in", () => {
  beforeEach(() => vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "client-id"));
  afterEach(() => {
    delete window.google;
    vi.unstubAllEnvs();
  });

  it("is off without a client id", () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "");
    expect(googleEnabled()).toBe(false);
  });

  it("initialises with our client id and draws the button in the container", async () => {
    const { api } = installGoogle();
    const box = document.createElement("div");
    await renderGoogleButton(box, vi.fn(), { width: 300 });

    expect(api.initialize).toHaveBeenCalledWith(expect.objectContaining({ client_id: "client-id" }));
    expect(api.renderButton).toHaveBeenCalledWith(
      box,
      expect.objectContaining({ text: "continue_with", width: 300 }),
    );
  });

  it("hands the ID token to the caller", async () => {
    const { state } = installGoogle();
    const onCredential = vi.fn();
    await renderGoogleButton(document.createElement("div"), onCredential);

    state.callback!({ credential: "id-token" });
    expect(onCredential).toHaveBeenCalledWith("id-token");
  });

  it("ignores a response with no credential", async () => {
    const { state } = installGoogle();
    const onCredential = vi.fn();
    await renderGoogleButton(document.createElement("div"), onCredential);

    state.callback!({});
    expect(onCredential).not.toHaveBeenCalled();
  });
});
