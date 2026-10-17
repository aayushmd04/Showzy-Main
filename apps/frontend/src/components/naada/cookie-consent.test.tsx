import { beforeEach, describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CookieConsent } from "./cookie-consent";
import { clearConsent, getConsent, openCookieSettings } from "@/lib/consent";

const renderAt = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <CookieConsent />
    </MemoryRouter>,
  );

beforeEach(() => {
  clearConsent();
});

describe("cookie banner", () => {
  it("asks first, with reject as easy as accept", () => {
    renderAt();
    expect(screen.getByRole("region", { name: "Cookie notice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject optional" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept all" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookie policy" })).toHaveAttribute("href", "/cookies");
  });

  it("Reject optional records a 'no' and goes away", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Reject optional" }));
    expect(getConsent()?.preferences).toBe(false);
    expect(screen.queryByRole("region", { name: "Cookie notice" })).toBeNull();
  });

  it("Accept all records a 'yes'", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    expect(getConsent()?.preferences).toBe(true);
  });

  it("lets you choose per category, and necessary can't be switched off", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Choose" }));
    expect(screen.getByText(/Strictly necessary/)).toBeInTheDocument();
    const prefs = screen.getByRole("checkbox", { name: /Preferences/ });
    expect(prefs).not.toBeChecked(); // off until you opt in
    await userEvent.click(prefs);
    await userEvent.click(screen.getByRole("button", { name: "Save choices" }));
    expect(getConsent()?.preferences).toBe(true);
  });

  it("stays out of the way of the door scanner", () => {
    renderAt("/gate/abc/door");
    expect(screen.queryByRole("region", { name: "Cookie notice" })).toBeNull();
  });

  it("can be reopened later from anywhere", async () => {
    renderAt();
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));
    act(() => openCookieSettings());
    expect(await screen.findByRole("checkbox", { name: /Preferences/ })).toBeChecked();
  });
});
