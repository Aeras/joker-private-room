import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/durak";
const mocks = vi.hoisted(() => ({ command: vi.fn(), current: vi.fn(), players: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => ({ options }),
}));
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: mocks.command }));
vi.mock("@/services/authFunctions", () => ({
  getCurrentPlayer: mocks.current,
  logoutPlayer: vi.fn(),
}));
vi.mock("@/services/realIdentity", () => ({ realIdentityService: { listPlayers: mocks.players } }));
vi.mock("@/components/joker/ScreenShell", () => ({
  ScreenShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/durak/DurakOnlineTable", () => ({
  DurakOnlineTable: ({
    onBack,
    onNewGame,
  }: {
    onBack: (reason?: "finished") => void;
    onNewGame: () => Promise<void>;
  }) => (
    <>
      <button onClick={() => onBack("finished")}>Table back</button>
      <button onClick={() => void onNewGame()}>New match</button>
    </>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("DURAK authenticated table navigation", () => {
  it.each(["playing", "finished"])(
    "returns from %s without restarting session lookup",
    async (lifecycle) => {
      mocks.current
        .mockResolvedValueOnce({ id: "host", displayName: "Host", role: "host" })
        .mockImplementation(() => new Promise(() => {}));
      mocks.command.mockImplementation(async ({ data }) =>
        data.action === "membership"
          ? { ok: true, membership: { code: "ABC123" } }
          : {
              ok: true,
              room: {
                code: "ABC123",
                variant: "perevodnoy",
                capacity: 6,
                lifecycle,
                hostPlayerId: "host",
                seats: [],
              },
            },
      );
      const Home = Route.options.component!;
      render(<Home />);
      fireEvent.click(await screen.findByRole("button", { name: "Επιστροφή στο παιχνίδι μου" }));
      fireEvent.click(await screen.findByRole("button", { name: "Table back" }));
      expect(screen.getByRole("button", { name: "Δημιουργία" })).toBeInTheDocument();
      expect(screen.queryByText("Έλεγχος σύνδεσης…")).toBeNull();
      expect(mocks.current).toHaveBeenCalledTimes(1);
      expect(mocks.players).not.toHaveBeenCalled();
    },
  );
  it("creates a waiting room directly using the finished match variant/capacity", async () => {
    mocks.current.mockResolvedValue({ id: "host", displayName: "Host", role: "host" });
    mocks.command.mockImplementation(async ({ data }) =>
      data.action === "membership"
        ? { ok: true, membership: { code: "ABC123" } }
        : {
            ok: true,
            room: {
              code: data.action === "create" ? "DEF456" : "ABC123",
              variant: "perevodnoy",
              capacity: 6,
              lifecycle: data.action === "create" ? "waiting" : "finished",
              hostPlayerId: "host",
              seats: [
                { index: 0, occupant: "human", name: "Host" },
                { index: 1, occupant: "empty", name: null },
              ],
            },
          },
    );
    const Home = Route.options.component!;
    render(<Home />);
    fireEvent.click(await screen.findByRole("button", { name: "Επιστροφή στο παιχνίδι μου" }));
    fireEvent.click(await screen.findByRole("button", { name: "New match" }));
    await screen.findByRole("button", { name: "+ Bot" });
    expect(mocks.command).toHaveBeenCalledWith({
      data: { action: "create", variant: "perevodnoy", capacity: 6 },
    });
    expect(
      mocks.command.mock.calls.some(([args]) =>
        ["leave", "end_game", "start"].includes(args.data.action),
      ),
    ).toBe(false);
    expect(mocks.current).toHaveBeenCalledTimes(1);
  });
});
