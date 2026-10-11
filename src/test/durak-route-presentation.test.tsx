import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "@/routes/durak";

const command = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: () => ReactNode }) => ({ options }),
}));
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: command }));
vi.mock("@/components/joker/PlayerSessionGate", () => ({
  PlayerSessionGate: ({ children }: { children: (player: { id: string }) => ReactNode }) =>
    children({ id: "host" }),
}));
vi.mock("@/components/joker/ScreenShell", () => ({
  ScreenShell: ({ children }: { children: ReactNode }) => (
    <div>
      <header data-testid="lobby-header">DURAK</header>
      {children}
    </div>
  ),
}));
vi.mock("@/durak/DurakOnlineTable", () => ({
  DurakOnlineTable: ({ onBack }: { onBack: () => void }) => (
    <button onClick={onBack}>Active table back</button>
  ),
}));
afterEach(() => {
  cleanup();
  command.mockReset();
});

describe("DURAK route presentation boundary", () => {
  it.each(["playing", "finished"])(
    "removes the lobby header for a %s table and restores it on back",
    async (lifecycle) => {
      command.mockImplementation(async ({ data }: { data: { action: string } }) =>
        data.action === "membership"
          ? { ok: true, membership: { code: "ABC123" } }
          : { ok: true, room: { code: "ABC123", lifecycle, hostPlayerId: "host", seats: [] } },
      );
      const Home = Route.options.component!;
      render(<Home />);
      expect(screen.getByTestId("lobby-header")).toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "Επιστροφή στο παιχνίδι μου" }));
      await screen.findByRole("button", { name: "Active table back" });
      expect(screen.queryByTestId("lobby-header")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Active table back" }));
      expect(screen.getByTestId("lobby-header")).toBeInTheDocument();
    },
  );
});
