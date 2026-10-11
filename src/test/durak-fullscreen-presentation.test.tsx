import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurakFullscreenHand } from "@/durak/DurakFullscreenHand";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";
import { createDeck } from "@/durak/rules";
import { beginDurak, legalDurakMoves } from "@/durak/engine";
import type { DurakGameView } from "@/services/durakRoomFunctions";
const command = vi.hoisted(() => vi.fn());
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: command }));
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <span data-artwork /> }));
afterEach(() => {
  cleanup();
  command.mockReset();
});
const hand = createDeck();
function fixture(n: number, variant: DurakGameView["variant"] = "podkidnoy"): DurakGameView {
  return {
    variant,
    trump: "clubs",
    trumpCard: hand[0]!,
    stock: 12,
    discardCount: 0,
    round: 1,
    attacker: 0,
    defender: 1,
    pairs: [],
    taking: false,
    ended: false,
    fool: null,
    handSizes: Array(n).fill(6),
    myHand: hand.slice(0, 6),
    legalMoves: [{ type: "attack", card: hand[0]! }],
    seat: 0,
    revision: 1,
  };
}
describe("DURAK fullscreen presentation", () => {
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "keeps the returning human's opening attack playable in %s after another seat exits",
    async (variant) => {
      // Public shape of the reported table; synthetic cards, no live private hands.
      const state = beginDurak(variant, 4, () => 0.5);
      state.hands = [hand.slice(0, 18), hand.slice(18, 19), hand.slice(19), []];
      state.deck = [];
      state.pairs = [];
      state.finishes = [];
      state.passes = [];
      state.primaryAttacker = 0;
      state.attacker = 0;
      state.defender = 1;
      state.firstAttack = false;
      state.defenderStartingHand = 1;
      const game = fixture(4, variant);
      game.myHand = state.hands[0]!;
      game.handSizes = state.hands.map((cards) => cards.length);
      game.stock = 0;
      game.legalMoves = legalDurakMoves(state, 0);
      expect(game.legalMoves).toHaveLength(18);
      command.mockResolvedValue({ ok: true, game });
      const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
      await screen.findByText("Η σειρά σου — επίλεξε φύλλο για επίθεση");
      const cards = container.querySelectorAll<HTMLButtonElement>("[data-durak-hand-card]");
      expect([...cards].every((card) => !card.disabled)).toBe(true);
      fireEvent.click(cards[0]!);
      expect(command).toHaveBeenLastCalledWith({
        data: { action: "move", code: "TEST", move: { type: "attack", card: hand[0] } },
      });
    },
  );
  it("names the opponent whose opening attack is awaited", async () => {
    const game = fixture(2);
    game.attacker = 1;
    game.defender = 0;
    game.legalMoves = [];
    command.mockResolvedValue({ ok: true, game });
    render(
      <DurakOnlineTable
        code="TEST"
        seats={[{ index: 1, name: "Git", occupant: "human" }]}
        onBack={() => {}}
      />,
    );
    await screen.findByText("Περιμένουμε επίθεση από Git");
    expect(screen.queryByText("Η σειρά σου — επίλεξε φύλλο για επίθεση")).toBeNull();
  });
  it.each([0, 1, 6, 12, 24, 36])("fits a %i-card fan with stable stacking", (count) => {
    const { container } = render(
      <DurakFullscreenHand
        cards={hand.slice(0, count)}
        busy={false}
        canPlay={() => true}
        onPlay={() => {}}
      />,
    );
    const cards = container.querySelectorAll<HTMLButtonElement>("[data-durak-hand-card]");
    expect(cards).toHaveLength(count);
    cards.forEach((card, index) => {
      expect(card.style.zIndex).toBe(String(index));
      expect(card.disabled).toBe(false);
    });
    expect(container.querySelector("[data-durak-hand]")?.getAttribute("style")).toContain(
      ` / ${Math.max(1, count - 1)}`,
    );
  });
  it("dispatches legal taps and blocks disabled and pending taps without faded classes", () => {
    const onPlay = vi.fn();
    const { container, rerender } = render(
      <DurakFullscreenHand
        cards={hand.slice(0, 2)}
        busy={false}
        canPlay={(card) => card.rank === 6}
        onPlay={onPlay}
      />,
    );
    const cards = container.querySelectorAll<HTMLButtonElement>("button");
    fireEvent.click(cards[0]!);
    fireEvent.click(cards[1]!);
    expect(onPlay).toHaveBeenCalledExactlyOnceWith(hand[0]);
    expect(cards[1]!.className).not.toMatch(/opacity/);
    rerender(
      <DurakFullscreenHand cards={hand.slice(0, 2)} busy canPlay={() => true} onPlay={onPlay} />,
    );
    fireEvent.click(cards[0]!);
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
  it.each([2, 3, 4, 5, 6])(
    "renders only the %i-player opponents using existing avatars",
    async (n) => {
      command.mockResolvedValue({ ok: true, game: fixture(n) });
      const seats = Array.from({ length: n }, (_, index) => ({
        index,
        name: index === 0 ? "Local" : index === 1 ? "Git" : `Bot ${index}`,
        occupant: index < 2 ? "human" : "bot",
      }));
      const { container } = render(
        <DurakOnlineTable code="TEST" seats={seats} onBack={() => {}} />,
      );
      await screen.findByLabelText("Online τραπέζι DURAK");
      expect(container.querySelectorAll("[data-durak-opponent-seat]")).toHaveLength(n - 1);
      expect(container.querySelector('[data-durak-opponent-seat="0"]')).toBeNull();
      expect(screen.getByAltText("Git").getAttribute("src")).toBe("/avatars/git2.png");
      expect(container.querySelectorAll("img")).toHaveLength(n - 1);
      container
        .querySelectorAll("img")
        .forEach((image) =>
          expect(existsSync(resolve("public", "." + image.getAttribute("src")))).toBe(true),
        );
    },
  );
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "preserves legal card commands in %s",
    async (variant) => {
      command.mockResolvedValue({ ok: true, game: fixture(2, variant) });
      const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
      await screen.findByLabelText("Online τραπέζι DURAK");
      fireEvent.click(container.querySelector("[data-durak-hand-card]")!);
      expect(command).toHaveBeenLastCalledWith({
        data: { action: "move", code: "TEST", move: { type: "attack", card: hand[0] } },
      });
    },
  );
  it("preserves selected defense targets and the take action", async () => {
    const game = fixture(2);
    game.defender = 0;
    game.attacker = 1;
    game.pairs = [{ attack: hand[1]! }, { attack: hand[2]! }];
    game.legalMoves = [
      { type: "defend", card: hand[0]!, pair: 0 },
      { type: "defend", card: hand[0]!, pair: 1 },
      { type: "take" },
    ];
    command.mockResolvedValue({ ok: true, game });
    const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
    await screen.findByLabelText("Online τραπέζι DURAK");
    fireEvent.click(container.querySelectorAll("[data-durak-pair]")[1]!);
    expect(container.querySelectorAll("[data-durak-pair]")[1]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(container.querySelector("[data-durak-hand-card]")!);
    expect(command).toHaveBeenLastCalledWith({
      data: { action: "move", code: "TEST", move: { type: "defend", card: hand[0], pair: 1 } },
    });
    await screen.findByText("Παίρνω");
    await vi.waitFor(() => expect(screen.getByText("Παίρνω")).not.toBeDisabled());
    fireEvent.click(screen.getByText("Παίρνω"));
    expect(command).toHaveBeenLastCalledWith({
      data: { action: "move", code: "TEST", move: { type: "take" } },
    });
  });
  it("preserves the legal transfer command in Perevodnoy", async () => {
    const game = fixture(2, "perevodnoy");
    game.legalMoves = [{ type: "transfer", card: hand[0]! }];
    command.mockResolvedValue({ ok: true, game });
    const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
    await screen.findByLabelText("Online τραπέζι DURAK");
    fireEvent.click(container.querySelector("[data-durak-hand-card]")!);
    expect(command).toHaveBeenLastCalledWith({
      data: { action: "move", code: "TEST", move: { type: "transfer", card: hand[0] } },
    });
  });
  it("replaces a cancelled room's stale hand with the termination notice", async () => {
    command
      .mockResolvedValueOnce({ ok: true, game: fixture(2) })
      .mockResolvedValue({ ok: false, code: "ROOM_NOT_FOUND" });
    const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
    await screen.findByLabelText("Online τραπέζι DURAK");
    fireEvent.keyDown(screen.getByRole("button", { name: "Μενού παιχνιδιού" }), { key: "Enter" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Ανανέωση" }));
    await screen.findByText("Το παιχνίδι DURAK τερματίστηκε.");
    expect(container.querySelector("[data-durak-hand-card]")).toBeNull();
  });
});
