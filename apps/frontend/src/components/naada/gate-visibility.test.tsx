import { useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { SWRConfig } from "swr";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppStoreProvider, useStore } from "@/store/app-store";
import * as api from "@/lib/api";
import { AccountMenu } from "./account-menu";
import { RequireGate } from "./require-gate";

vi.mock("@/lib/api", async (orig) => ({
  ...(await orig<typeof import("@/lib/api")>()),
  swrFetcher: vi.fn(),
  getCities: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/screens/not-found", () => ({ NotFoundScreen: () => <p>404 page not found</p> }));

const EVENT = { id: "ev-1", title: "Tonight", venue: "Hall", starts_at: "", ends_at: "" };
const NOTHING: api.MyGate = { invitations: [], assignments: [] };
const INVITED: api.MyGate = {
  invitations: [{ id: "a1", event: EVENT, invited_by: "Host", label: "", invited_at: "" }],
  assignments: [],
};
const ON_DUTY: api.MyGate = {
  invitations: [],
  assignments: [{ id: "a2", event: EVENT, label: "", open_now: true, opens: "", closes: "", scanned: 0 }],
};

function SignedInAs({ role }: { role: "listener" | "host" }) {
  const { setRole, setCurrentUser } = useStore();
  useEffect(() => {
    setCurrentUser({ id: "u1", email: "me@x.test", full_name: "Me", role: role === "host" ? "venue_owner" : "attendee" });
    setRole(role);
  }, [setRole, setCurrentUser, role]);
  return null;
}

function mount(ui: React.ReactNode, role: "listener" | "host" = "listener", path = "/") {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <MemoryRouter initialEntries={[path]}>
        <AppStoreProvider seed={{}}>
          <SignedInAs role={role} />
          {ui}
        </AppStoreProvider>
      </MemoryRouter>
    </SWRConfig>,
  );
}

const serverSays = (gate: api.MyGate) => vi.mocked(api.swrFetcher).mockResolvedValue(gate);

async function openMenu() {
  await userEvent.click(await screen.findByRole("button", { name: /account menu/i }));
}

describe("who is shown Gate duty", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.getCities).mockResolvedValue([]);
  });

  it("hides the menu entry from an ordinary account — it has no invitation and no door", async () => {
    serverSays(NOTHING);
    mount(<AccountMenu />);
    await openMenu();
    await waitFor(() => expect(api.swrFetcher).toHaveBeenCalledWith("/gate/mine/"));
    expect(screen.queryByText(/gate duty/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/gate team/i)).not.toBeInTheDocument();
    expect(screen.getByText("My tickets")).toBeInTheDocument();
  });

  it("shows it to someone with a pending invitation", async () => {
    serverSays(INVITED);
    mount(<AccountMenu />);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: /gate duty/i })).toHaveAttribute("href", "/gate");
  });

  it("shows it to someone who has accepted a door", async () => {
    serverSays(ON_DUTY);
    mount(<AccountMenu />);
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: /gate duty/i })).toBeInTheDocument();
  });

  it("gives a venue account its doors & gate team entry, but not the invitee page", async () => {
    serverSays(NOTHING);
    mount(<AccountMenu />, "host");
    await openMenu();
    expect(await screen.findByRole("menuitem", { name: /doors & gate team/i })).toHaveAttribute("href", "/host/events");
    expect(screen.queryByRole("menuitem", { name: /^gate duty/i })).not.toBeInTheDocument();
  });

  it("a server error shows nothing rather than a link that may not work", async () => {
    vi.mocked(api.swrFetcher).mockRejectedValue(new Error("down"));
    mount(<AccountMenu />);
    await openMenu();
    await waitFor(() => expect(api.swrFetcher).toHaveBeenCalled());
    expect(screen.queryByText(/gate duty/i)).not.toBeInTheDocument();
  });
});

function gateRoutes() {
  return (
    <Routes>
      <Route path="/gate" element={<RequireGate><p>the gate page</p></RequireGate>} />
      <Route path="/gate/:id/door" element={<RequireGate door><p>the door scanner</p></RequireGate>} />
    </Routes>
  );
}

describe("the gate pages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("are a plain 404 to an account with no invitation or door", async () => {
    serverSays(NOTHING);
    mount(gateRoutes(), "listener", "/gate");
    expect(await screen.findByText("404 page not found")).toBeInTheDocument();
    expect(screen.queryByText("the gate page")).not.toBeInTheDocument();
  });

  it("are a 404 even to a venue account that has no gate work of its own", async () => {
    serverSays(NOTHING);
    mount(gateRoutes(), "host", "/gate");
    expect(await screen.findByText("404 page not found")).toBeInTheDocument();
  });

  it("open for an invitee", async () => {
    serverSays(INVITED);
    mount(gateRoutes(), "listener", "/gate");
    expect(await screen.findByText("the gate page")).toBeInTheDocument();
  });

  it("open the scanner only for the event the account was assigned to", async () => {
    serverSays(ON_DUTY);
    mount(gateRoutes(), "listener", "/gate/ev-1/door");
    expect(await screen.findByText("the door scanner")).toBeInTheDocument();
  });

  it("keep the scanner of any other event shut", async () => {
    serverSays(ON_DUTY);
    mount(gateRoutes(), "listener", "/gate/someone-elses-event/door");
    expect(await screen.findByText("404 page not found")).toBeInTheDocument();
    expect(screen.queryByText("the door scanner")).not.toBeInTheDocument();
  });

  it("don't flash the page while the server is still being asked", async () => {
    vi.mocked(api.swrFetcher).mockReturnValue(new Promise(() => {}));
    mount(gateRoutes(), "listener", "/gate");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("the gate page")).not.toBeInTheDocument();
  });
});
