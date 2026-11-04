import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("shows the picture when there is one", () => {
    const { container } = render(<Avatar src="/media/artists/x.jpg" name="Divya Nair" />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/media/artists/x.jpg");
  });

  it("draws the initial on a gradient when there is no picture", () => {
    const { container } = render(<Avatar name="divya nair" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("D")).toBeInTheDocument();
  });

  it("falls back to the initial when the picture fails to load, instead of a broken-image icon", () => {
    const { container } = render(<Avatar src="/media/artists/gone.jpg" name="Ishaan M" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("I")).toBeInTheDocument();
  });

  it("gives the same name the same colour every time", () => {
    const a = render(<Avatar name="Tara D" />).container.firstElementChild?.getAttribute("style");
    const b = render(<Avatar name="Tara D" />).container.firstElementChild?.getAttribute("style");
    expect(a).toBe(b);
  });
});
