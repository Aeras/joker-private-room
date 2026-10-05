import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  applyOverdueTimeout,
  applyReclaimControl,
  HUMAN_TURN_TIMEOUT_MS,
  isSoloHumanPaused,
} from "@/domain/controller";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalGameState,
} from "@/domain/gameState";
import { projectGameForSeat } from "@/domain/projection";

function soloGame(): CanonicalGameState {
  return {
    gameId: "11111111-1111-4111-8111-111111111111",
    roomId: "22222222-2222-4222-8222-222222222222",
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 20,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 0,
      cardsPerPlayer: 1,
      dealerSeat: 3,
      firstDeclarerSeat: 0,
      firstLeaderSeat: 0,
      currentActorSeat: 0,
      phase: "CARD_PLAY",
    },
    seats: [
      {
        seatIndex: 0,
        owner: { type: "human", playerId: "solo-human" },
        controller: "human",
        connected: true,
        takeoverAt: null,
        reclaimable: false,
      },
      ...([1, 2, 3] as const).map((seatIndex) => ({
        seatIndex,
        owner: {
          type: "bot" as const,
          botId: `bot-${seatIndex}`,
          displayName: `Bot ${seatIndex}`,
          personalityId: `bot-${seatIndex}`,
          strategyProfileId: "strong-basic-v1",
          catalogVersion: "test-v1",
        },
        controller: "permanent_bot" as const,
        connected: false,
        takeoverAt: null,
        reclaimable: false,
      })),
    ] as CanonicalGameState["seats"],
    cards: {
      deck: [],
      drawCursor: 0,
      hands: [
        [{ kind: "standard", id: "solo-7-hearts", suit: "hearts", rank: "7" }],
        [],
        [],
        [],
      ],
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: null,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [0, 0, 0, 0],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: null },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
    },
    timing: {
      currentHumanDeadline: "2026-10-05T12:00:30.000Z",
      timeoutTakeoverActive: false,
    },
  };
}

describe("JK-006 durable solo-human pause", () => {
  it("converts the expired sole-human turn into a reclaim-only paused state", () => {
    const timed = applyOverdueTimeout(soloGame(), "2026-10-05T12:00:30.000Z");
    expect(timed.ok && timed.changed).toBe(true);
    if (!timed.ok || !timed.changed) return;

    expect(isSoloHumanPaused(timed.state, 0)).toBe(true);
    expect(timed.state.seats[0].controller).toBe("human");
    expect(timed.state.seats[0].owner).toEqual({ type: "human", playerId: "solo-human" });
    expect(timed.state.timing.currentHumanDeadline).toBeNull();

    const projection = projectGameForSeat(timed.state, 0);
    expect(projection.local.reclaimAvailable).toBe(true);
    expect(projection.local.legalActions).toEqual([{ type: "reclaim_control" }]);
  });

  it("resumes the exact seat with a fresh authoritative 30 second deadline", () => {
    const timed = applyOverdueTimeout(soloGame(), "2026-10-05T12:00:30.000Z");
    if (!timed.ok || !timed.changed) throw new Error("expected solo pause");

    const resumedAt = "2026-10-05T12:05:00.000Z";
    const resumed = applyReclaimControl(timed.state, 0, resumedAt);
    expect(resumed.ok && resumed.changed).toBe(true);
    if (!resumed.ok || !resumed.changed) return;

    expect(resumed.state.seats[0].owner).toEqual({ type: "human", playerId: "solo-human" });
    expect(resumed.state.seats[0].controller).toBe("human");
    expect(resumed.state.seats[0].reclaimable).toBe(false);
    expect(resumed.state.timing.currentHumanDeadline).toBe(
      new Date(Date.parse(resumedAt) + HUMAN_TURN_TIMEOUT_MS).toISOString(),
    );
  });

  it("keeps production human commands blocked until reclaim", () => {
    const source = readFileSync(resolve(process.cwd(), "src/server/gameplayCommands.ts"), "utf8");
    expect(source).toContain("isSoloHumanPaused(loaded.canonicalState, loaded.viewerSeat)");
    expect(source).toContain('code: "CONTROLLER_CHANGED"');
  });

  it("makes the scheduler sleep on the canonical paused marker", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261005120900_jk006_solo_human_pause_wake.sql"),
      "utf8",
    );
    expect(sql).toContain("v_reclaimable_text = 'true'");
    expect(sql).toContain("return null;");
    expect(sql).toContain("next_wakeup_at is distinct from private.derive_game_next_wakeup_internal");
  });

  it("persists an explicit solo-pause system transition in both timeout entry paths", () => {
    const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
    expect(read("src/server/gameControl.ts")).toContain('"system_solo_human_pause"');
    expect(read("src/server/reconciliationCore.ts")).toContain('"system_solo_human_pause"');
  });
});
