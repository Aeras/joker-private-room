import { describe, expect, it } from "vitest";
import type { Card } from "@/domain/cards";
import {
  projectionContainsPendingCardInCurrentTrick,
  type LocalPlayPresentation,
} from "@/components/table/localPlayPresentation";

const card: Card = { id: "hearts-A", kind: "standard", suit: "hearts", rank: "A" };

function presentation(): LocalPlayPresentation {
  return {
    gameId: "game-1",
    dealNumber: 3,
    card,
    cardId: card.id,
    actorSeat: 0,
    sourceStateVersion: 12,
    acceptedStateVersion: null,
    geometryEpoch: 4,
    releaseRect: { left: 100, top: 200, right: 160, bottom: 284, width: 60, height: 84 },
    status: "submitted",
  };
}

describe("JK-004 local play presentation correlation", () => {
  it("accepts only the same canonical card from the same actor seat", () => {
    const pending = presentation();
    expect(projectionContainsPendingCardInCurrentTrick(pending, [
      { seatIndex: 0, card },
    ])).toBe(true);
    expect(projectionContainsPendingCardInCurrentTrick(pending, [
      { seatIndex: 1, card },
    ])).toBe(false);
  });

  it("does not accept a different canonical card with the same actor", () => {
    const pending = presentation();
    const other: Card = { id: "hearts-K", kind: "standard", suit: "hearts", rank: "K" };
    expect(projectionContainsPendingCardInCurrentTrick(pending, [
      { seatIndex: 0, card: other },
    ])).toBe(false);
  });
});
