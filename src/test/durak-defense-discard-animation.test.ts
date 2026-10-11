import { act, renderHook, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useDurakPresentation,
  DURAK_CARD_FLIGHT_MS,
  DURAK_PLAY_BEAT_MS,
} from "@/durak/useDurakPresentation";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import type { DurakPublicEvent, DurakPair } from "@/durak/engine";
import type { DurakCard } from "@/durak/rules";
const card = (rank: DurakCard["rank"]): DurakCard => ({ suit: "clubs", rank });
const pairs = (n: number): DurakPair[] =>
  Array.from({ length: n }, () => ({ attack: card(6), defense: card(7) }));
const base: DurakGameView = {
  variant: "podkidnoy",
  trump: "hearts",
  trumpCard: card(6),
  stock: 10,
  discardCount: 0,
  round: 1,
  attacker: 0,
  defender: 1,
  pairs: [],
  taking: false,
  ended: false,
  fool: null,
  handSizes: [6, 6],
  myHand: [],
  legalMoves: [],
  seat: 0,
  revision: 1,
  presentationSequence: 0,
  events: [],
};
const beat = DURAK_CARD_FLIGHT_MS + DURAK_PLAY_BEAT_MS;
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("DURAK authoritative discard lifecycle", () => {
  it("lands three consecutive defended bouts 4→10→12, survives polling and queues multiple rounds", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useDurakPresentation("ABC123"));
    act(() => result.current.accept(base));
    let seq = 0,
      total = 0;
    const events: DurakPublicEvent[] = [];
    for (const [round, n] of [
      [1, 2],
      [2, 3],
      [3, 1],
    ]) {
      events.push({
        sequence: ++seq,
        kind: "defend",
        seat: 1,
        card: card(7),
        round: round!,
        attacker: 0,
        defender: 1,
        attackSeats: [0],
        pairs: pairs(n!),
        handSizes: [6, 6],
        discardCount: total,
      });
      total += 2 * n!;
      events.push({
        sequence: ++seq,
        kind: "discard",
        round: round!,
        pairs: pairs(n!),
        discardCount: total,
      });
    }
    const next = {
      ...base,
      revision: 2,
      round: 4,
      discardCount: 12,
      presentationSequence: seq,
      events,
    };
    act(() => result.current.accept(next));
    for (const [from, to] of [
      [0, 4],
      [4, 10],
      [10, 12],
    ]) {
      act(() => vi.advanceTimersByTime(beat));
      const collection = result.current.collection!;
      expect(collection).not.toBeNull();
      expect(result.current.game?.discardCount).toBe(from);
      expect(result.current.presenting).toBe(true);
      act(() => result.current.accept({ ...next, revision: 3 }));
      expect(result.current.collection).toBe(collection);
      for (let i = 0; i < to! - from!; i++) {
        act(() => result.current.landDiscard(collection.id, i));
        expect(result.current.game?.discardCount).toBe(from! + i + 1);
        // Duplicate completion callbacks cannot inflate totals.
        act(() => result.current.landDiscard(collection.id, i));
        expect(result.current.game?.discardCount).toBe(from! + i + 1);
      }
      act(() => result.current.finishDiscard(collection.id));
    }
    expect(result.current.game?.discardCount).toBe(12);
    expect(result.current.game?.round).toBe(4);
    expect(result.current.presenting).toBe(false);
    expect(result.current.collection).toBeNull();
  });
  it("does not discard a fully covered table when the confirmed outcome is take", () => {
    const { result } = renderHook(() => useDurakPresentation("ABC123"));
    act(() => result.current.accept({ ...base, pairs: pairs(2) }));
    act(() =>
      result.current.accept({
        ...base,
        revision: 2,
        round: 2,
        presentationSequence: 1,
        events: [{ sequence: 1, kind: "take", round: 1, pairs: pairs(2), discardCount: 0 }],
      }),
    );
    expect(result.current.collection?.kind).toBe("take");
    expect(result.current.game?.discardCount).toBe(0);
    act(() => result.current.finishDiscard(result.current.collection!.id));
    expect(result.current.collection).toBeNull();
    expect(result.current.game?.discardCount).toBe(0);
  });
  it("requires exact authoritative count delta; never invents missing cards", () => {
    const { result } = renderHook(() => useDurakPresentation("ABC123"));
    act(() => result.current.accept(base));
    act(() =>
      result.current.accept({
        ...base,
        revision: 2,
        round: 2,
        discardCount: 6,
        presentationSequence: 1,
        events: [{ sequence: 1, kind: "discard", round: 1, pairs: pairs(1), discardCount: 6 }],
      }),
    );
    expect(result.current.collection).toBeNull();
    expect(result.current.game?.discardCount).toBe(6);
  });
  it("reconnects to the actual pile without replay; cancels old callbacks on room change", () => {
    const { result, rerender } = renderHook(({ code }) => useDurakPresentation(code), {
      initialProps: { code: "ABC123" },
    });
    const next = {
      ...base,
      discardCount: 12,
      presentationSequence: 1,
      events: [
        { sequence: 1, kind: "discard" as const, round: 1, pairs: pairs(2), discardCount: 12 },
      ],
    };
    act(() => result.current.accept(next));
    expect(result.current.collection).toBeNull();
    expect(result.current.game?.discardCount).toBe(12);
    const oldLand = result.current.landDiscard,
      oldFinish = result.current.finishDiscard;
    rerender({ code: "DEF456" });
    act(() => {
      oldLand(1, 0);
      oldFinish(1);
    });
    expect(result.current.game).toBeNull();
  });
});
