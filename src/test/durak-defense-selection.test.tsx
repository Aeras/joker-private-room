import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { durakTapMove, durakDropMove } from "@/durak/defenseSelection";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";
import { DurakFullscreenHand } from "@/durak/DurakFullscreenHand";
import { beginDurak, legalDurakMoves } from "@/durak/engine";
import type { DurakGameView } from "@/services/durakRoomFunctions";
const command = vi.hoisted(() => vi.fn());
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: command }));
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <span data-artwork /> }));
const jack = { suit: "diamonds", rank: 11 } as const;
const other = { suit: "hearts", rank: 6 } as const;
const attacks = [
  { attack: { suit: "clubs", rank: 7 } as const },
  { attack: { suit: "spades", rank: 7 } as const },
  { attack: { suit: "diamonds", rank: 7 } as const },
];
function fixture(variant: DurakGameView["variant"] = "podkidnoy"): DurakGameView {
  const m = beginDurak(variant, 4, () => 0.5);
  m.trump = "diamonds";
  m.pairs = attacks;
  m.hands[0] = [jack, other];
  m.defender = 0;
  m.defenderStartingHand = 3;
  m.firstAttack = false;
  return {
    variant,
    trump: m.trump,
    trumpCard: m.trumpCard,
    stock: m.deck.length,
    discardCount: 0,
    round: 1,
    attacker: 3,
    defender: 0,
    pairs: attacks,
    taking: false,
    ended: false,
    fool: null,
    handSizes: m.hands.map((h) => h.length),
    myHand: m.hands[0]!,
    legalMoves: legalDurakMoves(m, 0),
    seat: 0,
    revision: 1,
  };
}
const point = vi.fn();
beforeEach(() => {
  class TestPointerEvent extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: point });
});
afterEach(() => {
  cleanup();
  command.mockReset();
  point.mockReset();
  vi.unstubAllGlobals();
  delete (document as unknown as Record<string, unknown>)["elementFromPoint"];
});
describe("DURAK defense target selection", () => {
  it("blocks native image dragging from interrupting the pointer gesture", () => {
    const { container } = render(
      <DurakFullscreenHand cards={[jack]} busy={false} canPlay={() => true} onPlay={() => {}} />,
    );
    expect(fireEvent.dragStart(container.querySelector("[data-artwork]")!)).toBe(false);
  });
  it("ignores a second finger without cancelling or clicking through an active drag", () => {
    const play = vi.fn();
    const { container } = render(
      <DurakFullscreenHand
        cards={[jack, other]}
        busy={false}
        canPlay={() => true}
        onPlay={play}
        onDrop={() => {}}
        canDrop={() => true}
      />,
    );
    const cards = container.querySelectorAll("button");
    fireEvent.pointerDown(cards[0]!, { pointerId: 1, clientX: 20, clientY: 300, button: 0 });
    fireEvent.pointerMove(cards[0]!, { pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.pointerDown(cards[1]!, { pointerId: 2, clientX: 50, clientY: 300, button: 0 });
    fireEvent.pointerCancel(cards[1]!, { pointerId: 2 });
    fireEvent.click(cards[1]!);
    expect(document.querySelector(".durak-drag-card")).not.toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
  it.each(["podkidnoy", "perevodnoy"] as const)(
    "prefers same-suit defense over the first legal trump cover in %s",
    (variant) => {
      const game = fixture(variant);
      expect(game.legalMoves.filter((m) => m.type === "defend")).toHaveLength(3);
      expect(durakTapMove(jack, game.legalMoves, game.pairs, null)).toEqual({
        type: "defend",
        card: jack,
        pair: 2,
      });
    },
  );
  it("honors explicit target, refuses an invalid target and ignores covered same-suit attacks", () => {
    const game = fixture();
    expect(durakTapMove(jack, game.legalMoves, game.pairs, 0)).toEqual({
      type: "defend",
      card: jack,
      pair: 0,
    });
    expect(durakTapMove(other, game.legalMoves, game.pairs, 0)).toBeUndefined();
    const remaining = game.legalMoves.filter((m) => m.type !== "defend" || m.pair !== 2);
    expect(durakTapMove(jack, remaining, game.pairs, null)).toEqual({
      type: "defend",
      card: jack,
      pair: 0,
    });
  });
  it("never invents drop legality or converts an invalid drop to another move", () => {
    const game = fixture();
    expect(durakDropMove(jack, game.legalMoves, 1)).toEqual({
      type: "defend",
      card: jack,
      pair: 1,
    });
    expect(durakDropMove(other, game.legalMoves, 0)).toBeUndefined();
    expect(durakDropMove(jack, game.legalMoves, 9)).toBeUndefined();
    expect(durakDropMove(jack, [{ type: "transfer", card: jack }], 0)).toBeUndefined();
  });
  it("retains attack and transfer taps when no target is selected", () => {
    expect(durakTapMove(jack, [{ type: "attack", card: jack }], [], null)?.type).toBe("attack");
    expect(durakTapMove(jack, [{ type: "transfer", card: jack }], attacks, null)?.type).toBe(
      "transfer",
    );
  });
  it("sends the user's reported jack-of-trumps tap to the same-suit seven", async () => {
    command.mockResolvedValue({ ok: true, game: fixture() });
    const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
    await screen.findByLabelText("Online τραπέζι DURAK");
    fireEvent.click(container.querySelector("[data-durak-hand-card]")!);
    expect(command).toHaveBeenLastCalledWith({
      data: { action: "move", code: "TEST", move: { type: "defend", card: jack, pair: 2 } },
    });
  });
  it("highlights and sends exactly the dragged defense target, without a following tap", async () => {
    command.mockResolvedValue({ ok: true, game: fixture() });
    const { container } = render(<DurakOnlineTable code="TEST" seats={[]} onBack={() => {}} />);
    await screen.findByLabelText("Online τραπέζι DURAK");
    const card = container.querySelector("[data-durak-hand-card]")!,
      pair = container.querySelectorAll("[data-durak-pair]")[1]!;
    point.mockReturnValue(pair);
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 30, clientY: 300, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 200, clientY: 180 });
    expect(pair).toHaveAttribute("data-durak-drop-target", "true");
    expect(document.querySelector(".durak-drag-card")).not.toBeNull();
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 200, clientY: 180 });
    fireEvent.click(card);
    expect(command.mock.calls.filter(([args]) => args.data.action === "move")).toEqual([
      [{ data: { action: "move", code: "TEST", move: { type: "defend", card: jack, pair: 1 } } }],
    ]);
    expect(document.querySelector(".durak-drag-card")).toBeNull();
  });
  it.each(["outside", "cancel", "invalid"])(
    "returns a %s drag to the hand without playing",
    (kind) => {
      const drop = vi.fn(),
        play = vi.fn();
      const { container } = render(
        <DurakFullscreenHand
          cards={[jack]}
          busy={false}
          canPlay={() => true}
          onPlay={play}
          onDrop={drop}
          canDrop={() => kind !== "invalid"}
        />,
      );
      const card = container.querySelector("button")!,
        pair = document.createElement("button");
      pair.dataset["durakPair"] = "";
      pair.dataset["durakPairIndex"] = "0";
      point.mockReturnValue(kind === "outside" ? null : pair);
      fireEvent.pointerDown(card, { pointerId: 1, clientX: 20, clientY: 300, button: 0 });
      fireEvent.pointerMove(card, { pointerId: 1, clientX: 200, clientY: 180 });
      if (kind === "cancel") fireEvent.pointerCancel(card, { pointerId: 1 });
      else fireEvent.pointerUp(card, { pointerId: 1, clientX: 200, clientY: 180 });
      fireEvent.click(card);
      expect(drop).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();
      expect(document.querySelector(".durak-drag-card")).toBeNull();
    },
  );
  it("cancels a drag when an authoritative update makes the hand busy", () => {
    const props = {
      cards: [jack],
      canPlay: () => true,
      onPlay: vi.fn(),
      onDrop: vi.fn(),
      canDrop: () => true,
    };
    const { container, rerender } = render(<DurakFullscreenHand {...props} busy={false} />);
    const card = container.querySelector("button")!;
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 20, clientY: 300, button: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 200, clientY: 180 });
    rerender(<DurakFullscreenHand {...props} busy />);
    expect(document.querySelector(".durak-drag-card")).toBeNull();
    act(() => fireEvent.pointerUp(card, { pointerId: 1, clientX: 200, clientY: 180 }));
    expect(props.onDrop).not.toHaveBeenCalled();
  });
});
