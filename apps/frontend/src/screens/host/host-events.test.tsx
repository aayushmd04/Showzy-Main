import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider } from "@/store/app-store";
import * as api from "@/lib/api";
import { HostEventsScreen, groupOf } from "./host-events";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMyEvents: vi.fn() };
});

describe("groupOf", () => {
  const now = "2026-10-26";
  it("puts unpublished events in drafts, whatever their date", () => {
    expect(groupOf({ status: "draft", date: "2026-01-01" }, now)).toBe("drafts");
    expect(groupOf({ status: "draft", date: "2027-01-01" }, now)).toBe("drafts");
  });
  it("puts finished, cancelled and earlier-dated events in past", () => {
    expect(groupOf({ status: "completed", date: "2027-01-01" }, now)).toBe("past");
    expect(groupOf({ status: "cancelled", date: "2027-01-01" }, now)).toBe("past");
    expect(groupOf({ status: "published", date: "2026-10-10" }, now)).toBe("past");
  });
  it("puts today and later published events in upcoming", () => {
    expect(groupOf({ status: "published", date: "2026-10-26" }, now)).toBe("upcoming");
    expect(groupOf({ status: "live", date: "2026-10-26" }, now)).toBe("upcoming");
    expect(groupOf({ status: "published", date: "2027-02-01" }, now)).toBe("upcoming");
  });
});

const ev = (id: string, title: string, start: string, status: string) => ({
  id,
  title,
  start_datetime: `${start}T19:00:00Z`,
  end_datetime: `${start}T22:00:00Z`,
  status,
  venue: "v1",
  venue_name: "Gokulam Music Hall",
  ticket_tiers: [],
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <AppStoreProvider seed={{ events: [], artists: [], venues: [] }}>
        <HostEventsScreen />
      </AppStoreProvider>
    </MemoryRouter>,
  );
}

describe("HostEventsScreen", () => {
  beforeEach(() => {
    vi.mocked(api.getMyEvents).mockResolvedValue({
      count: 3,
      next: null,
      previous: null,
      results: [
        ev("a", "Future Jazz Night", "2099-03-01", "published"),
        ev("b", "Unfinished Poetry Slam", "2099-04-01", "draft"),
        ev("c", "Old Open Mic", "2020-01-01", "completed"),
      ],
    } as never);
  });

  it("opens on upcoming and moves between the three groups", async () => {
    renderScreen();
    expect(await screen.findByText("Future Jazz Night")).toBeInTheDocument();
    expect(screen.queryByText("Old Open Mic")).not.toBeInTheDocument();
    expect(screen.queryByText("Unfinished Poetry Slam")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Drafts/ }));
    expect(screen.getByText("Unfinished Poetry Slam")).toBeInTheDocument();
    expect(screen.queryByText("Future Jazz Night")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: /Past/ }));
    expect(screen.getByText("Old Open Mic")).toBeInTheDocument();
  });

  it("opens on drafts when nothing is upcoming", async () => {
    vi.mocked(api.getMyEvents).mockResolvedValue({
      count: 1, next: null, previous: null,
      results: [ev("b", "Unfinished Poetry Slam", "2099-04-01", "draft")],
    } as never);
    renderScreen();
    expect(await screen.findByText("Unfinished Poetry Slam")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Drafts/ })).toHaveAttribute("aria-selected", "true");
  });
});
