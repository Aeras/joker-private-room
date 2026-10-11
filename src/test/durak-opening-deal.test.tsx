import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginDurak } from "@/durak/engine";
import { durakDealTiming, DURAK_TRUMP_PLACE_MS, DURAK_STOCK_PLACE_MS } from "@/durak/dealTiming";
import { DurakOnlineTable } from "@/durak/DurakOnlineTable";
import { DurakOpeningDeal } from "@/durak/DurakOpeningDeal";
import {
  startDurakDeal,
  advanceDurakBot,
  DURAK_BOT_REACTION_MS,
} from "../../supabase/functions/durak-commands/bot-turn";
import type { DurakGameView } from "@/services/durakRoomFunctions";
const command = vi.hoisted(() => vi.fn());
vi.mock("@/services/durakRoomFunctions", () => ({ durakRoomCommand: command }));
vi.mock("@/components/joker/PlayingCard", () => ({
  PlayingCard: ({ faceDown }: { faceDown?: boolean }) => (
    <span data-art={faceDown ? "back" : "face"} />
  ),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  command.mockReset();
});
function view(): DurakGameView {
  const state = startDurakDeal(
    beginDurak("podkidnoy", 4, () => 0.4),
    0,
  );
  return {
    variant: state.variant,
    trump: state.trump,
    trumpCard: state.trumpCard,
    stock: state.deck.length,
    discardCount: 0,
    round: 1,
    attacker: state.attacker,
    defender: state.defender,
    pairs: [],
    taking: false,
    ended: false,
    fool: null,
    handSizes: [6, 6, 6, 6],
    myHand: state.hands[0]!,
    legalMoves: [],
    seat: 0,
    revision: 1,
    dealStartedAt: state.dealStartedAt!,
    dealReadyAt: state.dealReadyAt!,
    dealServerNow: 0,
  };
}
describe("DURAK opening deal", () => {
  it("lands the trump before moving the remaining stock and keeps both mounted until handoff", () => {
    vi.useFakeTimers();
    const calls: { element: HTMLElement; options: KeyframeAnimationOptions }[] = [];
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: function (this: HTMLElement, _frames: Keyframe[], options: KeyframeAnimationOptions) {
        calls.push({ element: this, options });
        return { cancel: vi.fn(), currentTime: 0 };
      },
    });
    try {
      const game = view();
      const timing = durakDealTiming(4);
      const done = vi.fn();
      const rendered = render(<DurakOpeningDeal game={game} onComplete={done} />);
      const trump = calls.find(call => call.element.className === "durak-deal-trump")!;
      const stock = calls.find(call => call.element.className === "durak-deal-stock")!;
      expect(trump.options.duration).toBe(DURAK_TRUMP_PLACE_MS);
      expect(stock.options.delay).toBe(Number(trump.options.delay) + DURAK_TRUMP_PLACE_MS);
      expect(stock.options.duration).toBe(DURAK_STOCK_PLACE_MS);
      expect(stock.options.fill).toBe("both");
      expect(timing.duration).toBe(timing.stockAt + DURAK_STOCK_PLACE_MS + 120);
      act(() => vi.advanceTimersByTime(game.dealReadyAt! - 1));
      expect(rendered.container.querySelector(".durak-deal-stock")).not.toBeNull();
      expect(done).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(done).toHaveBeenCalledOnce();
      rendered.unmount();
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });
  it.each([2, 3, 4, 5, 6])(
    "keeps the canonical %i-seat deal and lowest trump starter behind the barrier",
    (players) => {
      const state = startDurakDeal(
        beginDurak("perevodnoy", players, () => 0.31),
        1000,
      );
      expect(state.hands.map((hand) => hand.length)).toEqual(Array(players).fill(6));
      expect(state.deck.length + state.hands.flat().length).toBe(36);
      const trumps = state.hands
        .flatMap((hand, seat) =>
          hand
            .filter((card) => card.suit === state.trump)
            .map((card) => ({ seat, rank: card.rank })),
        )
        .sort((a, b) => a.rank - b.rank);
      expect(state.attacker).toBe(trumps[0]?.seat ?? 0);
      expect(state.dealReadyAt! - state.dealStartedAt!).toBe(durakDealTiming(players).duration);
      const seats = Array.from({ length: players }, (_, index) => ({ index, occupant: "bot" }));
      expect(advanceDurakBot(state, seats, state.dealReadyAt!)).toBe(state);
      expect(
        advanceDurakBot(state, seats, state.dealReadyAt! + DURAK_BOT_REACTION_MS).pairs,
      ).toHaveLength(1);
    },
  );
  it("hides the open hand and blocks taps until presentation finishes", async () => {
    vi.useFakeTimers();
    const game = view();
    command.mockResolvedValue({ ok: true, game });
    const rendered = render(<DurakOnlineTable code="OPEN01" seats={[]} onBack={() => {}} />);
    await act(async () => {});
    expect(rendered.container.querySelectorAll("[data-deal-card]")).toHaveLength(24);
    expect(rendered.container.querySelectorAll("[data-durak-hand-card]")).toHaveLength(0);
    expect(screen.queryByText("Η σειρά σου — επίλεξε φύλλο για επίθεση")).toBeNull();
    act(() => vi.advanceTimersByTime(game.dealReadyAt! - 1));
    expect(rendered.container.querySelector("[data-durak-opening-deal]")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(rendered.container.querySelector("[data-durak-opening-deal]")).toBeNull();
    expect(rendered.container.querySelectorAll("[data-durak-hand-card]")).toHaveLength(6);
  });
  it("continues a late arrival from elapsed time and cancels animations on exit", () => {
    vi.useFakeTimers();
    const game = view();
    game.dealServerNow = game.dealReadyAt! - 400;
    const cancel = vi.fn();
    const animate = vi.fn(() => ({ cancel, currentTime: 0 }));
    Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
    const done = vi.fn();
    const rendered = render(<DurakOpeningDeal game={game} onComplete={done} />);
    act(() => vi.advanceTimersByTime(399));
    expect(done).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(done).toHaveBeenCalledWith(game.dealReadyAt);
    rendered.unmount();
    expect(cancel).toHaveBeenCalled();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });
  it("does not replay an already completed deal on reconnect", async () => {
    const game = view();
    game.dealServerNow = game.dealReadyAt! + 1000;
    command.mockResolvedValue({ ok: true, game });
    const rendered = render(<DurakOnlineTable code="RETURN" seats={[]} onBack={() => {}} />);
    await act(async () => {});
    expect(rendered.container.querySelector("[data-durak-opening-deal]")).toBeNull();
    expect(rendered.container.querySelectorAll("[data-durak-hand-card]")).toHaveLength(6);
  });
});
