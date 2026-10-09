import { describe, expect, it } from "vitest";
import {
  advanceSimulationCheckpoint,
  createSimulationCheckpoint,
  resultOfCheckpoint,
  simulateFullGame,
  LAB_TIERS,
} from "./simulation.server";

const config = {
  seed: 81,
  ruleset: "popular" as const,
  lineup: [...LAB_TIERS, LAB_TIERS[0]] as [
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
    (typeof LAB_TIERS)[number],
  ],
  strategyVersion: "baseline",
};
describe("serializable canonical simulation checkpoints", () => {
  it("resumes a full game across JSON checkpoints with the identical deck stream and result", () => {
    let checkpoint = createSimulationCheckpoint(config),
      chunks = 0;
    while (checkpoint.state.lifecycle !== "complete") {
      checkpoint = JSON.parse(
        JSON.stringify(advanceSimulationCheckpoint(checkpoint, { now: () => 0 }, { maxSteps: 17 })),
      );
      chunks++;
      if (chunks > 300) throw Error("Checkpoint deadlock");
    }
    expect(chunks).toBeGreaterThan(20);
    expect(resultOfCheckpoint(checkpoint)).toEqual(simulateFullGame(config, { now: () => 0 }));
  }, 30000);
  it("leaves the last committed checkpoint intact on cancellation or rejection", () => {
    const original = createSimulationCheckpoint(config),
      before = structuredClone(original);
    expect(() => advanceSimulationCheckpoint(original, { cancelled: () => true })).toThrow(
      "cancelled",
    );
    expect(() =>
      advanceSimulationCheckpoint(original, { select: () => ({ type: "declare", value: 99 }) }),
    ).toThrow("Rejected");
    expect(original).toEqual(before);
    expect(() => resultOfCheckpoint(original)).toThrow("not complete");
  });
  it("enforces work limits and refuses live-room or human-seat checkpoints", () => {
    const original = createSimulationCheckpoint(config);
    expect(advanceSimulationCheckpoint(original, { now: () => 0 }, { maxSteps: 3 }).steps).toBe(3);
    expect(() => advanceSimulationCheckpoint(original, {}, { maxSteps: 65 })).toThrow("limits");
    const changed = structuredClone(original);
    changed.state.gameId = "real-game";
    expect(() => advanceSimulationCheckpoint(changed)).toThrow("checkpoint");
    changed.state.gameId = original.state.gameId;
    changed.state.seats[0].controller = "human";
    expect(() => advanceSimulationCheckpoint(changed)).toThrow("checkpoint");
  });
});
