import { describe, expect, it } from "vitest";
import type { Room } from "@/domain/players";
import type { PlayerGameProjection } from "@/domain/projection";
import { derivePublicDialogueEvents } from "./publicEvents";

const room = {
  code: "AB12",
  hostId: "human-0",
  rulesetId: "popular",
  botSettings: { botsTalk: true, allowProfanity: false, aiEnabled: false, intensity: "normal" },
  status: "playing",
  seats: [
    { index: 0, occupant: { type: "human", player: { id: "human-0", displayName: "Νίκος", role: "host" }, connected: true } },
    { index: 1, occupant: { type: "bot", bot: { id: "ka-monika", displayName: "κα. Μόνικα", personalityId: "ka-monika" } } },
    { index: 2, occupant: { type: "bot", bot: { id: "thomoulis", displayName: "Θωμούλης", personalityId: "thomoulis" } } },
    { index: 3, occupant: { type: "bot", bot: { id: "archimandritis", displayName: "Αρχι...μανδρίτης", personalityId: "archimandritis" } } },
  ],
} as Room;

function projection(overrides: Partial<PlayerGameProjection> = {}): PlayerGameProjection {
  return {
    gameId: "00000000-0000-4000-8000-000000000001",
    roomId: "00000000-0000-4000-8000-000000000002",
    rulesetId: "popular",
    rulesVersion: "popular-v1",
    stateSchemaVersion: 3,
    stateVersion: 10,
    lifecycle: "active",
    viewerSeat: 0,
    progression: { round: 1, dealNumber: 1, indexInPhase: 0, cardsPerPlayer: 5, dealerSeat: 3, firstDeclarerSeat: 0, firstLeaderSeat: 0, currentActorSeat: 0, phase: "DECLARATION" },
    initialDealerSelection: null,
    seats: [] as unknown as PlayerGameProjection["seats"],
    trump: { status: "resolved", suit: null },
    declarations: { currentDeclarerSeat: 0, values: [null, null, null, null] },
    cards: { ownHand: [], ownHandVisible: true, exposedTrumpCard: null, currentTrick: [], completedTricks: [] },
    score: { tricksTaken: [0, 0, 0, 0], currentDealScores: [0, 0, 0, 0], cumulativeTotals: [0, 0, 0, 0], finalPlacements: [null, null, null, null], completedDeals: [], roundPremia: [] },
    local: { legalActions: [], reclaimAvailable: false, humanDeadline: null },
    ...overrides,
  } as PlayerGameProjection;
}

describe("derivePublicDialogueEvents", () => {
  it("emits zero/high declaration events but ignores ordinary declarations", () => {
    const previous = projection();
    const zero = projection({ stateVersion: 11, declarations: { currentDeclarerSeat: 1, values: [0, null, null, null] } });
    expect(derivePublicDialogueEvents(previous, zero, room).map((event) => event.type)).toEqual(["PLAYER_DECLARED_ZERO"]);

    const ordinary = projection({ stateVersion: 11, declarations: { currentDeclarerSeat: 1, values: [2, null, null, null] } });
    expect(derivePublicDialogueEvents(previous, ordinary, room)).toEqual([]);

    const high = projection({ stateVersion: 11, declarations: { currentDeclarerSeat: 1, values: [4, null, null, null] } });
    expect(derivePublicDialogueEvents(previous, high, room).map((event) => event.type)).toEqual(["PLAYER_DECLARED_HIGH"]);
  });

  it("uses stable dedup-friendly ids for the same committed state", () => {
    const previous = projection();
    const next = projection({ stateVersion: 11, declarations: { currentDeclarerSeat: 1, values: [0, null, null, null] } });
    const first = derivePublicDialogueEvents(previous, next, room)[0];
    const second = derivePublicDialogueEvents(previous, next, room)[0];
    expect(first?.id).toBe(second?.id);
    expect(first?.id).toContain("state-11:PLAYER_DECLARED_ZERO:0");
  });

  it("derives provider-facing events without serializing local private hand data", () => {
    const previous = projection({ cards: { ownHand: [{ id: "SECRET-HAND", kind: "normal", rank: "A", suit: "spades" }], ownHandVisible: true, exposedTrumpCard: null, currentTrick: [], completedTricks: [] } });
    const next = projection({ stateVersion: 11, declarations: { currentDeclarerSeat: 1, values: [0, null, null, null] }, cards: previous.cards });
    const serialized = JSON.stringify(derivePublicDialogueEvents(previous, next, room));
    expect(serialized).not.toContain("SECRET-HAND");
    expect(serialized).not.toContain("ownHand");
  });
});
