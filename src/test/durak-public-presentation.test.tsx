import { renderHook, act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useDurakPresentation,
  DURAK_CARD_FLIGHT_MS,
  DURAK_PLAY_BEAT_MS,
} from "@/durak/useDurakPresentation";
import {
  beginDurak,
  applyDurakMove,
  durakAttackSeats,
  type DurakPresentationEvent,
} from "@/durak/engine";
import { recordDurakPlay } from "../../supabase/functions/durak-commands/presentation";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import { DurakPlayedCard } from "@/durak/DurakPlayedCard";
vi.mock("@/components/joker/PlayingCard", () => ({ PlayingCard: () => <span>Artwork</span> }));
const card = { suit: "hearts", rank: 6 } as const;
const defense = { suit: "hearts", rank: 7 } as const;
const base: DurakGameView = {
  variant: "podkidnoy",
  trump: "clubs",
  trumpCard: card,
  stock: 12,
  discardCount: 0,
  round: 1,
  attacker: 0,
  defender: 1,
  pairs: [],
  taking: false,
  ended: false,
  fool: null,
  handSizes: [6, 6, 6],
  myHand: [card],
  legalMoves: [{ type: "attack", card }],
  seat: 0,
  revision: 1,
  presentationSequence: 0,
  events: [],
};
const events: DurakPresentationEvent[] = [
  {
    sequence: 1,
    seat: 0,
    card,
    kind: "attack",
    round: 1,
    attacker: 0,
    defender: 1,
    attackSeats: [0],
    pairs: [{ attack: card }],
    handSizes: [5, 6, 6],
  },
  {
    sequence: 2,
    seat: 1,
    card: defense,
    kind: "defend",
    round: 1,
    attacker: 0,
    defender: 1,
    attackSeats: [0, 2],
    pairs: [{ attack: card, defense }],
    handSizes: [5, 5, 6],
  },
];
const next: DurakGameView = {
  ...base,
  revision: 2,
  presentationSequence: 2,
  events,
  pairs: events[1]!.pairs,
};
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("DURAK confirmed public presentation", () => {
  it("reveals the finished result only after all final public flights settle", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDurakPresentation("RESULT"));
    act(() => result.current.accept(base));
    act(() =>
      result.current.accept({
        ...next,
        ended: true,
        fool: 2,
        finishOrder: [0, 1],
        finishOrderComplete: true,
      }),
    );
    expect(result.current.game?.ended).toBe(false);
    act(() => vi.advanceTimersByTime(2 * (DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS) - 1));
    expect(result.current.game?.ended).toBe(false);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current.game?.ended).toBe(true);
    expect(result.current.game?.finishOrder).toEqual([0, 1]);
  });
  it("animates from the identified opponent and cancels the effect when removed", () => {
    const cancel = vi.fn();
    const original = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    try {
      const { container, unmount } = render(
        <div className="durak-fullscreen">
          <div data-durak-opponent-seat="1">
            <span className="durak-fullscreen-avatar" />
          </div>
          <DurakPlayedCard card={defense} flight={events[1]!} localSeat={0} />
        </div>,
      );
      expect(HTMLElement.prototype.animate).toHaveBeenCalledTimes(1);
      expect(
        container.querySelector("[data-durak-flight]")?.getAttribute("data-durak-flight"),
      ).toBe("2");
      unmount();
      expect(cancel).toHaveBeenCalledOnce();
    } finally {
      HTMLElement.prototype.animate = original;
    }
  });
  it("shows cards safely when the browser has no Web Animations API", () => {
    const { container } = render(<DurakPlayedCard card={card} flight={events[0]!} localSeat={0} />);
    expect(container.textContent).toBe("Artwork");
  });
  it("updates the public defender after a canonical transfer without modifying the result", () => {
    const state = beginDurak("perevodnoy", 3, () => 0.5);
    state.hands = [
      [{ suit: "clubs", rank: 8 }],
      [{ suit: "diamonds", rank: 6 }, defense],
      [
        { suit: "spades", rank: 8 },
        { suit: "spades", rank: 9 },
      ],
    ];
    state.deck = [];
    state.primaryAttacker = 0;
    state.defender = 1;
    state.pairs = [{ attack: card }];
    state.defenderStartingHand = 2;
    const move = { type: "transfer", card: state.hands[1]![0]! } as const;
    const after = applyDurakMove(state, 1, move);
    const recorded = recordDurakPlay(state, after, 1, move);
    expect(recorded.presentationEvents?.[0]?.defender).toBe(2);
    const { presentationSequence, presentationEvents, ...canonical } = recorded;
    expect(presentationSequence).toBe(1);
    expect(presentationEvents).toHaveLength(1);
    expect(canonical).toEqual(after);
  });
  it("plays a bot batch once in order, removes own card, then restores canonical legal moves", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDurakPresentation("ABC123"));
    act(() => result.current.accept(base));
    act(() => result.current.accept(next));
    expect(result.current.flight?.sequence).toBe(1);
    expect(result.current.game?.myHand).toEqual([]);
    expect(result.current.game?.legalMoves).toEqual([]);
    act(() => result.current.accept(next));
    act(() => vi.advanceTimersByTime(DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS));
    expect(result.current.flight?.sequence).toBe(2);
    expect(result.current.game?.pairs[0]?.defense).toEqual(defense);
    act(() => result.current.accept(base));
    expect(result.current.flight?.sequence).toBe(2);
    act(() => vi.advanceTimersByTime(DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS));
    expect(result.current.flight).toBeNull();
    expect(result.current.game).toEqual(next);
  });
  it("does not replay old history on first entry or after a missing-history gap", () => {
    const { result } = renderHook(() => useDurakPresentation("ABC123"));
    act(() => result.current.accept(next));
    expect(result.current.flight).toBeNull();
    act(() =>
      result.current.accept({
        ...next,
        revision: 3,
        presentationSequence: 50,
        events: [{ ...events[0]!, sequence: 50 }],
      }),
    );
    expect(result.current.flight).toBeNull();
    expect(result.current.game?.revision).toBe(3);
  });
  it("cancels old room timers and rejects a late old-room transport response", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ code }) => useDurakPresentation(code), {
      initialProps: { code: "ABC123" },
    });
    const oldAccept = result.current.accept;
    act(() => oldAccept(base));
    act(() => oldAccept(next));
    rerender({ code: "DEF456" });
    act(() => oldAccept(next));
    act(() => vi.runAllTimers());
    expect(result.current.game).toBeNull();
    expect(result.current.flight).toBeNull();
  });
  it("records only accepted public cards, retains the final defense before cleanup and caps history", () => {
    const state = beginDurak("podkidnoy", 3, () => 0.5);
    state.hands = [[card], [defense], [{ suit: "spades", rank: 9 }]];
    state.deck = [];
    state.primaryAttacker = 0;
    state.defender = 1;
    state.pairs = [{ attack: card }];
    state.hands[0] = [];
    state.finishes = [2];
    state.firstAttack = false;
    const after = applyDurakMove(state, 1, { type: "defend", pair: 0, card: defense });
    expect(after.pairs).toEqual([]);
    const recorded = recordDurakPlay(state, after, 1, { type: "defend", pair: 0, card: defense });
    expect(recorded.presentationEvents?.[0]?.pairs).toEqual([{ attack: card, defense }]);
    expect(recorded.presentationEvents?.[0]).not.toHaveProperty("hands");
    expect(recorded.presentationEvents?.[0]).not.toHaveProperty("deck");
    expect(recordDurakPlay(recorded, recorded, 1, { type: "pass" })).toBe(recorded);
    let history = recorded;
    for (let i = 0; i < 40; i++)
      history = recordDurakPlay(history, history, 1, { type: "defend", pair: 0, card: defense });
    expect(history.presentationEvents).toHaveLength(32);
    expect(history.presentationSequence).toBe(41);
  });
  it("shows only the opening attacker, then both permitted adjacent attackers without hidden-rank deductions", () => {
    const state = beginDurak("podkidnoy", 4, () => 0.5);
    state.primaryAttacker = 0;
    state.defender = 1;
    expect(durakAttackSeats(state)).toEqual([0]);
    state.pairs = [{ attack: card }];
    expect(durakAttackSeats(state)).toEqual([0, 2]);
    state.finishes = [0];
    expect(durakAttackSeats(state)).toEqual([2]);
    state.ended = true;
    expect(durakAttackSeats(state)).toEqual([]);
  });
});
