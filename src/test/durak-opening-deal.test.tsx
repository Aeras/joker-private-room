import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { beginDurak } from "@/durak/engine";
import {
  durakDealTiming,
  DURAK_TRUMP_PLACE_MS,
  DURAK_STOCK_PLACE_MS,
  DURAK_HAND_EXIT_MS,
  DURAK_HAND_ENTRANCE_MS,
} from "@/durak/dealTiming";
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
  it("moves all four closed piles beyond their screen edge before the real hand entrance", async () => {
    vi.useFakeTimers();
    const calls: { element: HTMLElement; frames: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const origin = this.className === "durak-deal-origin";
      const layer = this.className === "durak-opening-deal";
      return { left: origin ? 50 : 0, top: origin ? 250 : 0, width: layer ? 640 : 50, height: layer ? 360 : 70 } as DOMRect;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: function (this: HTMLElement, frames: Keyframe[], options: KeyframeAnimationOptions) {
        calls.push({ element: this, frames, options });
        return { cancel: vi.fn(), currentTime: 0 };
      },
    });
    try {
      command.mockResolvedValue({ ok: true, game: view() });
      render(<DurakOnlineTable code="EXIT" seats={[]} onBack={() => {}} />);
      await act(async () => {});
      for (let seat = 0; seat < 4; seat++) {
        const card = calls.find(call => call.element.dataset["dealCard"] === String(seat))!;
        const last = card.frames.at(-1)!;
        expect(last["opacity"]).toBe(1); // Movement carries the whole card offscreen; no premature fade.
        const [x, y] = String(last["transform"]).match(/-?\d+(?:\.\d+)?/g)!.map(Number);
        if (seat === 0) expect(285 + y!).toBeGreaterThan(360);
        if (seat === 1) expect(75 + x!).toBeLessThan(0);
        if (seat === 2) expect(285 + y!).toBeLessThan(0);
        if (seat === 3) expect(75 + x!).toBeGreaterThan(640);
      }
      const hand = calls.find(call => call.element.className === "durak-fullscreen-hand-row")!;
      expect(hand.frames[0]!["visibility"]).toBe("hidden");
      expect(hand.frames.at(-1)!["visibility"]).toBe("visible");
      expect(hand.options.delay).toBe(durakDealTiming(4).handAt + view().dealStartedAt!);
      expect(calls.filter(call => call.element.className === "durak-fullscreen-opponent-backs")).toHaveLength(3);
    } finally {
      delete (HTMLElement.prototype as { animate?: unknown }).animate;
    }
  });
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
      const trump = calls.find((call) => call.element.className === "durak-deal-trump")!;
      const stock = calls.find((call) => call.element.className === "durak-deal-stock")!;
      expect(trump.options.duration).toBe(DURAK_TRUMP_PLACE_MS);
      expect(stock.options.delay).toBe(Number(trump.options.delay) + DURAK_TRUMP_PLACE_MS);
      expect(stock.options.duration).toBe(DURAK_STOCK_PLACE_MS);
      expect(stock.options.fill).toBe("both");
      expect(timing.exitAt).toBe(timing.stockAt + DURAK_STOCK_PLACE_MS + 120);
      expect(timing.handAt).toBe(timing.exitAt + DURAK_HAND_EXIT_MS);
      expect(timing.duration).toBe(timing.handAt + DURAK_HAND_ENTRANCE_MS + 120);
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
    expect(rendered.container.querySelectorAll("[data-durak-hand-card]")).toHaveLength(6);
    expect(rendered.container.querySelector("[data-durak-hand]")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(
      Array.from(
        rendered.container.querySelectorAll<HTMLButtonElement>("[data-durak-hand-card]"),
      ).every((card) => card.disabled),
    ).toBe(true);
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
