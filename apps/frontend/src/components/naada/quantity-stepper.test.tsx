import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { QuantityStepper } from "./quantity-stepper";

function Harness({ start = 1, min = 1, max = 10 }: { start?: number; min?: number; max?: number }) {
  const [n, setN] = useState(start);
  return <QuantityStepper value={n} min={min} max={max} onChange={setN} />;
}

describe("QuantityStepper", () => {
  it("steps up and down and says how many are selected", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByLabelText("1 ticket selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    expect(screen.getByLabelText("3 tickets selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fewer tickets" }));
    expect(screen.getByLabelText("2 tickets selected")).toBeInTheDocument();
  });

  it("stops at the lowest and highest allowed", async () => {
    const user = userEvent.setup();
    render(<Harness start={1} min={1} max={2} />);
    expect(screen.getByRole("button", { name: "Fewer tickets" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "More tickets" }));
    expect(screen.getByRole("button", { name: "More tickets" })).toBeDisabled();
    expect(screen.getByLabelText("2 tickets selected")).toBeInTheDocument();
  });
});
