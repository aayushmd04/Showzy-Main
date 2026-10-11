import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { DeleteAccountFlow } from "./delete-account-flow";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async (orig) => {
  const real = await orig<typeof import("@/lib/api")>();
  return {
    ...real,
    getDeletionCheck: vi.fn(),
    requestDeletionCode: vi.fn(),
    deleteMyAccount: vi.fn(),
  };
});

const base: api.DeletionReport = {
  can_delete: true,
  blockers: [],
  warnings: [],
  erase: ["Your name and email"],
  keep: ["Tax records, without your name"],
};

function open(report: api.DeletionReport) {
  vi.mocked(api.getDeletionCheck).mockResolvedValue(report);
  const onDeleted = vi.fn();
  render(
    <MemoryRouter>
      <DeleteAccountFlow open onClose={() => {}} email="me@example.com" onExport={() => {}} onDeleted={onDeleted} />
    </MemoryRouter>,
  );
  return { onDeleted };
}

beforeEach(() => vi.clearAllMocks());

describe("delete account flow", () => {
  it("tells you what is erased and what is kept before anything else", async () => {
    open(base);
    expect(await screen.findByText("Your name and email")).toBeInTheDocument();
    expect(screen.getByText("Tax records, without your name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
  });

  it("refuses to continue while something is pending", async () => {
    open({
      ...base,
      can_delete: false,
      blockers: [{ code: "upcoming_events", title: "You have 1 upcoming event", detail: "Cancel it first.", items: ["Jazz Night"], action_url: "/host/events" }],
    });
    expect(await screen.findByText("You have 1 upcoming event")).toBeInTheDocument();
    expect(screen.getByText("Jazz Night")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("makes you acknowledge lost tickets", async () => {
    open({ ...base, warnings: [{ code: "upcoming_tickets", title: "You hold 2 tickets", detail: "They won't be refunded." }] });
    const cont = await screen.findByRole("button", { name: "Continue" });
    expect(cont).toBeDisabled();
    await userEvent.click(screen.getByRole("checkbox"));
    expect(cont).toBeEnabled();
  });

  it("needs the emailed code and the word DELETE, then confirms", async () => {
    vi.mocked(api.requestDeletionCode).mockResolvedValue({ detail: "sent" });
    vi.mocked(api.deleteMyAccount).mockResolvedValue({ detail: "ok" });
    const { onDeleted } = open(base);
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));

    const finalBtn = screen.getByRole("button", { name: "Permanently delete my account" });
    expect(finalBtn).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await userEvent.type(await screen.findByLabelText("Code from your email"), "123456");
    expect(finalBtn).toBeDisabled(); // still needs DELETE
    await userEvent.type(screen.getByLabelText(/Type/), "DELETE");
    expect(finalBtn).toBeEnabled();

    await userEvent.click(finalBtn);
    await waitFor(() => expect(api.deleteMyAccount).toHaveBeenCalledWith({ code: "123456", acknowledge_losses: false }));
    expect(await screen.findByText(/have been erased/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDeleted).toHaveBeenCalled();
  });

  it("shows a wrong code and deletes nothing", async () => {
    vi.mocked(api.requestDeletionCode).mockResolvedValue({ detail: "sent" });
    vi.mocked(api.deleteMyAccount).mockRejectedValue(new api.ApiError(400, "That code is wrong or has expired.", {}));
    open(base);
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Email me a code" }));
    await userEvent.type(await screen.findByLabelText("Code from your email"), "000000");
    await userEvent.type(screen.getByLabelText(/Type/), "DELETE");
    await userEvent.click(screen.getByRole("button", { name: "Permanently delete my account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("wrong or has expired");
  });
});
