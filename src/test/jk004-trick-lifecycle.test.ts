import { describe, expect, it } from "vitest";
import type { Card } from "@/domain/cards";
import {
  COLLISION_FAST_FORWARD_MS,
  NORMAL_TRICK_HOLD_MS,
  completedTrickPresentationId,
  trickPresentationTiming,
} from "@/components/table/trickPresentationModel";

const card = (id: string): Card => ({ id, kind: "standard", suit: "hearts", rank: "A" });

describe("JK-004 completed trick presentation", () => {
  it("uses canonical card order and winner in stable identity", () => {
    const base = {
      gameId: "game-1",
      dealNumber: 4,
      trickOrdinal: 2,
      cards: [
        { seatIndex: 0 as const, card: card("a") },
        { seatIndex: 1 as const, card: card("b") },
        { seatIndex: 2 as const, card: card("c") },
        { seatIndex: 3 as const, card: card("d") },
      ],
      winnerSeat: 2,
    };
    const id = completedTrickPresentationId(base);
    expect(id).toContain("cards:0:a,1:b,2:c,3:d");
    expect(id).toContain("winner:2");
    expect(completedTrickPresentationId({ ...base, winnerSeat: 3 })).not.toBe(id);
  });

  it("keeps normal hold inside the locked readable target and bounds collection", () => {
    const timing = trickPresentationTiming(false);
    expect(NORMAL_TRICK_HOLD_MS).toBeGreaterThanOrEqual(700);
    expect(NORMAL_TRICK_HOLD_MS).toBeLessThanOrEqual(1100);
    expect(timing.clearMs).toBeGreaterThan(timing.holdMs);
    expect(timing.clearMs - timing.holdMs).toBeLessThanOrEqual(350);
  });

  it("uses a short collision fast-forward without changing canonical turn timing", () => {
    expect(COLLISION_FAST_FORWARD_MS).toBeGreaterThan(0);
    expect(COLLISION_FAST_FORWARD_MS).toBeLessThan(300);
  });
});
