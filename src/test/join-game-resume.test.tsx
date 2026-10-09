import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  refresh: vi.fn(),
  verifyPin: vi.fn(),
  getCurrentPlayer: vi.fn(),
  logout: vi.fn(),
  listPlayers: vi.fn(),
  join: vi.fn(),
  listRooms: vi.fn(),
  lookup: { status: "none" as string, activeGame: null as unknown, roomCode: "" },
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => ({ code: undefined }) }),
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/components/joker/ScreenShell", () => ({
  ScreenShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useCurrentActiveGame", () => ({
  useCurrentActiveGame: () => ({ ...mocks.lookup, refresh: mocks.refresh }),
}));
vi.mock("@/services/realIdentity", () => ({
  realIdentityService: { listPlayers: mocks.listPlayers, verifyPin: mocks.verifyPin },
}));
vi.mock("@/services/authFunctions", () => ({
  getCurrentPlayer: mocks.getCurrentPlayer,
  logoutPlayer: mocks.logout,
}));
vi.mock("@/services/roomFunctions", () => ({
  joinProductionRoom: mocks.join,
  listWaitingRooms: mocks.listRooms,
}));

import { Route } from "@/routes/join";
const Component = Route.options.component as ComponentType;
const git = { id: "player", displayName: "Git", role: "player" };
const active = { gameId: "owned-game", roomCode: "ABCD", seatIndex: 1, lifecycle: "active", stateVersion: 10 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.lookup = { status: "none", activeGame: null, roomCode: "" };
  mocks.getCurrentPlayer.mockResolvedValue(git);
  mocks.listPlayers.mockResolvedValue([git]);
  mocks.verifyPin.mockResolvedValue({ ok: true, player: git });
  mocks.logout.mockResolvedValue({ ok: true });
  mocks.refresh.mockResolvedValue({ ok: true, activeGame: null });
  mocks.listRooms.mockResolvedValue({
    ok: true,
    rooms: [{ code: "WXYZ", hostName: "Νίκος", rulesetId: "popular", occupied: 2, humans: 2 }],
  });
  mocks.join.mockResolvedValue({ ok: true, room: { code: "WXYZ" } });
});
afterEach(cleanup);

describe("session-first join and game resume", () => {
  it("shows available rooms for an already signed-in player, without a room code field", async () => {
    render(<Component />);
    expect(await screen.findByText("Παιχνίδι του Νίκος")).toBeTruthy();
    expect(screen.queryByLabelText("Κωδικός δωματίου")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Συμμετοχή" }));
    await waitFor(() => expect(mocks.join).toHaveBeenCalledOnce());
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/lobby", search: { code: "WXYZ" },
    }));
    expect(mocks.verifyPin).not.toHaveBeenCalled();
  });

  it("asks for the personal PIN only without an existing session", async () => {
    mocks.getCurrentPlayer.mockResolvedValue(null);
    render(<Component />);
    await screen.findByRole("button", { name: "Σύνδεση" });
    expect(mocks.join).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Προσωπικό PIN"), { target: { value: "1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Σύνδεση" }));
    await waitFor(() => expect(mocks.verifyPin).toHaveBeenCalledWith("player", "1234"));
    expect(await screen.findByText("Παιχνίδι του Νίκος")).toBeTruthy();
  });

  it("does not reveal rooms when the personal PIN is wrong", async () => {
    mocks.getCurrentPlayer.mockResolvedValue(null);
    mocks.verifyPin.mockResolvedValue({ ok: false, code: "INVALID_CREDENTIALS" });
    render(<Component />);
    await screen.findByRole("button", { name: "Σύνδεση" });
    fireEvent.change(screen.getByLabelText("Προσωπικό PIN"), { target: { value: "0000" } });
    fireEvent.click(screen.getByRole("button", { name: "Σύνδεση" }));
    await waitFor(() => expect(mocks.verifyPin).toHaveBeenCalledOnce());
    expect(mocks.listRooms).not.toHaveBeenCalled();
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("returns to the current game instead of showing the room list", async () => {
    mocks.lookup = { status: "active", activeGame: active, roomCode: "" };
    render(<Component />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/table", search: { code: "ABCD", gameId: "owned-game" },
    }));
    expect(mocks.listRooms).not.toHaveBeenCalled();
  });

  it("returns to the existing waiting lobby instead of joining another room", async () => {
    mocks.lookup = { status: "waiting", activeGame: null, roomCode: "ABCD" };
    render(<Component />);
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/lobby", search: { code: "ABCD" },
    }));
    expect(mocks.join).not.toHaveBeenCalled();
  });

  it("fails closed if the membership lookup fails", async () => {
    mocks.lookup = { status: "error", activeGame: null, roomCode: "" };
    render(<Component />);
    expect(await screen.findByText("Δεν ήταν δυνατός ο έλεγχος της συμμετοχής σου.")).toBeTruthy();
    expect(mocks.join).not.toHaveBeenCalled();
  });
});
