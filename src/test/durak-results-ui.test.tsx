import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";
import { DurakResults } from "@/durak/DurakResults";
import type { DurakGameView } from "@/services/durakRoomFunctions";
const command = vi.hoisted(() => vi.fn());
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: command }));
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => null }));
afterEach(() => {
  cleanup();
  command.mockReset();
});
const name = (seat: number) => `Name ${seat}`;
function game(n = 4): DurakGameView {
  return {
    variant: "podkidnoy",
    trump: "clubs",
    trumpCard: { suit: "clubs", rank: 6 },
    stock: 0,
    discardCount: 30,
    round: 12,
    attacker: 2,
    defender: 0,
    pairs: [],
    taking: false,
    ended: true,
    fool: 1,
    handSizes: Array.from({ length: n }, (_, i) => (i === 1 ? 6 : 0)),
    myHand: [],
    legalMoves: [],
    seat: 0,
    revision: 10,
    finishOrder: Array.from({ length: n }, (_, i) => i)
      .filter((i) => i !== 1)
      .reverse(),
    finishOrderComplete: true,
  };
}
describe("DURAK match results", () => {
  it.each([2, 4, 6])(
    "automatically opens ordered %i-seat results, loser last; closes and reopens",
    (n) => {
      const view = game(n);
      render(<DurakResults game={view} playerName={name} />);
      const dialog = screen.getByRole("dialog");
      const rows = within(dialog).getAllByRole("listitem");
      expect(rows.map((row) => Number(row.getAttribute("data-durak-result-seat")))).toEqual([
        ...view.finishOrder!,
        1,
      ]);
      expect(rows[n - 1]).toHaveTextContent("Ηττημένος");
      fireEvent.click(screen.getByRole("button", { name: "Κλείσιμο αποτελεσμάτων" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Αποτελέσματα" }));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    },
  );
  it("shows no results before the displayed match ends", () => {
    const view = game();
    view.ended = false;
    const { rerender } = render(<DurakResults game={view} playerName={name} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rerender(<DurakResults game={{ ...view, ended: true }} playerName={name} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("handles a draw without labelling any player the loser", () => {
    const view = game(2);
    view.fool = null;
    view.handSizes = [0, 0];
    view.finishOrder = [0, 1];
    render(<DurakResults game={view} playerName={name} />);
    expect(screen.getByText("Ισοπαλία — δεν υπάρχει ηττημένος")).toBeInTheDocument();
    expect(screen.queryByText("Ηττημένος")).toBeNull();
  });
  it("does not fabricate positions for a pre-existing completed game", () => {
    const view = game();
    delete view.finishOrder;
    delete view.finishOrderComplete;
    render(<DurakResults game={view} playerName={name} />);
    expect(screen.getByText(/παλιότερη παρτίδα/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Name 0");
    expect(screen.getAllByRole("listitem")[0]).not.toHaveTextContent("1. ");
  });
  it("replaces stale attack/defense and waiting labels on the finished table", async () => {
    command.mockResolvedValue({ ok: true, game: game() });
    render(<DurakOnlineTable code="RESULT" seats={[]} onBack={() => {}} />);
    await screen.findByRole("dialog");
    expect(screen.queryByText(/Περιμένουμε επίθεση/)).toBeNull();
    expect(screen.queryByText(/Επίθεση:.*Άμυνα:/)).toBeNull();
    expect(screen.queryByText(/Αμύνεσαι/)).toBeNull();
  });
});
