import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/lib/api";
import { BranchSwitcher, HostBranchProvider, useHostBranch } from "./host-branch";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMyVenues: vi.fn() };
});
vi.mock("@/store/app-store", () => ({
  useStore: () => ({ role: "host", currentUser: { id: "u1" } }),
}));

const gokulam = { id: "v1", name: "Gokulam Music Hall", area: "Gokulam" };
const vijay = { id: "v2", name: "Vijayanagar Hall", area: "Vijayanagar" };

function Probe() {
  const b = useHostBranch();
  return (
    <p data-testid="probe">
      {b.current?.name ?? "none"}|{String(b.includes("v1"))}|{String(b.includes("v2"))}
    </p>
  );
}

function setup() {
  return render(
    <HostBranchProvider>
      <BranchSwitcher />
      <Probe />
    </HostBranchProvider>,
  );
}

describe("host branches", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getMyVenues).mockReset();
  });

  it("a single-branch host sees the name, no picker, and nothing is filtered", async () => {
    vi.mocked(api.getMyVenues).mockResolvedValue([gokulam] as never);
    setup();
    await screen.findByText("Gokulam Music Hall · Gokulam");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByTestId("probe")).toHaveTextContent("Gokulam Music Hall|true|true");
  });

  it("a multi-branch host can pick a branch, and only that branch is included", async () => {
    vi.mocked(api.getMyVenues).mockResolvedValue([gokulam, vijay] as never);
    setup();
    const picker = await screen.findByRole("combobox", { name: "Branch" });
    expect(screen.getByTestId("probe")).toHaveTextContent("Gokulam Music Hall|true|false");

    await act(async () => {
      await userEvent.selectOptions(picker, "v2");
    });
    expect(screen.getByTestId("probe")).toHaveTextContent("Vijayanagar Hall|false|true");
    expect(localStorage.getItem("showzy_host_branch")).toBe("v2");
  });

  it("remembers the branch between visits", async () => {
    localStorage.setItem("showzy_host_branch", "v2");
    vi.mocked(api.getMyVenues).mockResolvedValue([gokulam, vijay] as never);
    setup();
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("Vijayanagar Hall"));
  });

  it("shows nothing for a host with no branches yet", async () => {
    vi.mocked(api.getMyVenues).mockResolvedValue([] as never);
    setup();
    await waitFor(() => expect(api.getMyVenues).toHaveBeenCalled());
    expect(screen.getByTestId("probe")).toHaveTextContent("none|true|true");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});
