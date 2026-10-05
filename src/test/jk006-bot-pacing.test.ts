import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_SYNCHRONOUS_BOT_STEPS,
  PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET,
} from "@/domain/controller";
import {
  NORMAL_TRICK_HOLD_MS,
  NORMAL_TRICK_INTER_PLAY_BEAT_MS,
  NORMAL_TRICK_PLAY_SPACING_MS,
  NORMAL_TRICK_SETTLE_MS,
} from "@/components/table/trickPresentationModel";
import { LIVE_REQUEST_AUTOMATIC_STEP_BUDGET } from "@/server/reconciliation";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 bot pacing", () => {
  it("allows only one automatic action per live request and durable-worker reconciliation", () => {
    expect(LIVE_REQUEST_AUTOMATIC_STEP_BUDGET).toBe(1);
    expect(PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET).toBe(1);
    expect(MAX_SYNCHRONOUS_BOT_STEPS).toBeGreaterThan(1);
    const live = read("src/server/reconciliation.ts");
    expect(live).toContain("maxSteps = LIVE_REQUEST_AUTOMATIC_STEP_BUDGET");
    const edge = read("supabase/functions/game-reconciler/index.ts");
    expect(edge).toContain("PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET");
    expect(edge).not.toContain("claim.gameId,\n          MAX_SYNCHRONOUS_BOT_STEPS");
  });

  it("waits a full second after settle before the next visible normal-speed play", () => {
    expect(NORMAL_TRICK_INTER_PLAY_BEAT_MS).toBe(1_000);
    expect(NORMAL_TRICK_PLAY_SPACING_MS).toBe(NORMAL_TRICK_SETTLE_MS + 1_000);
    expect(NORMAL_TRICK_HOLD_MS).toBeGreaterThanOrEqual(850);
    expect(NORMAL_TRICK_HOLD_MS).toBeLessThanOrEqual(1000);
  });

  it("keeps client polling as a fallback instead of reintroducing request-side bot bursts", () => {
    const table = read("src/routes/table.tsx");
    expect(table).toContain("refreshAll");
    expect(table).toContain("setInterval");
    expect(read("src/server/reconciliationCore.ts")).toContain("STEP_BOUND");
  });
});
