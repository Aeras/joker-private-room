import { stableJson } from "@/lib/stableFingerprint";
import { describe, expect, it } from "vitest";
import { compactLabResult, configForJobGame, validateLabJobConfig } from "./jobModel";
import { LAB_TIERS, simulateFullGame } from "./simulation.server";
import { runLabWorkerChunk, type LabClaim } from "./worker";
const job = {
  games: 10 as const,
  seed: 321,
  ruleset: "popular" as const,
  lineup: null,
  compare: true,
};
describe("durable lab job model", () => {
  it("validates all supported run sizes and refuses malformed/unbounded requests", () => {
    for (const games of [10, 100, 1000, 5000])
      expect(validateLabJobConfig({ ...job, games }).games).toBe(games);
    for (const invalid of [
      { games: 5001 },
      { seed: -1 },
      { seed: 4294967295 },
      { lineup: [null, null, null, null] },
      { ruleset: "fake" },
      { compare: "yes" },
    ])
      expect(() => validateLabJobConfig({ ...job, ...invalid })).toThrow("INVALID_CONFIG");
  });
  it("uses matched seeds and fair seat/dealer rotation with only the chosen target upgraded", () => {
    for (let i = 0; i < 8; i += 2) {
      const b = configForJobGame(job, i),
        c = configForJobGame(job, i + 1);
      expect({ ...c, seatVersions: undefined }).toEqual({ ...b, seatVersions: undefined });
      expect(c.seatVersions?.filter((v) => v === "competitive-v2")).toHaveLength(1);
      expect(b.rotation).toBe(i / 2);
    }
    expect(configForJobGame(job, 8).seed).toBe(322);
    expect(() => configForJobGame(job, 20)).toThrow("INDEX");
    const fixed = {
      ...job,
      lineup: [LAB_TIERS[2], LAB_TIERS[1], LAB_TIERS[0], LAB_TIERS[2]] as [
        (typeof LAB_TIERS)[number],
        (typeof LAB_TIERS)[number],
        (typeof LAB_TIERS)[number],
        (typeof LAB_TIERS)[number],
      ],
    };
    expect(configForJobGame(fixed, 0).lineup).toEqual(fixed.lineup);
  });
  it("compacts actual results without losing metrics or retaining hidden canonical state", () => {
    const g = simulateFullGame(configForJobGame(job, 0)),
      r = compactLabResult(g);
    expect(r.metrics.reduce((n, m) => n + m.winShare, 0)).toBeCloseTo(1);
    expect(
      r.metrics
        .flatMap((m) => m.exact.map((e, i) => e + m.under[i]! + m.over[i]!))
        .reduce((a, b) => a + b, 0),
    ).toBe(96);
    expect(r.metrics.flatMap((m) => m.latencyHistogram).reduce((a, b) => a + b, 0)).toBe(
      g.decisions.length,
    );
    expect(r).not.toHaveProperty("state");
    expect(JSON.stringify(r)).not.toContain('"hands"');
    expect(r.inspection.length).toBeLessThanOrEqual(20);
  }, 30000);
  it("honors DB cancellation/fencing and persists a recoverable bounded checkpoint", async () => {
    let saved: unknown = null;
    const claim: LabClaim = {
      id: "job",
      lease_token: "lease",
      completed_games: 0,
      engine_version: "lab-engine-v1",
      config: job,
      checkpoint: null,
    };
    const repo = {
      claim: async () => claim,
      commit: async (i: unknown) => {
        saved = i;
        return false;
      },
    };
    expect(await runLabWorkerChunk(repo, "token")).toEqual({ claimed: true, committed: false });
    expect(saved).toMatchObject({ jobId: "job", gameIndex: 0, result: null, error: null });
    const checkpoint = (saved as { checkpoint: LabClaim["checkpoint"] }).checkpoint;
    expect(checkpoint?.steps).toBeGreaterThan(0);
    expect(checkpoint!.steps).toBeLessThanOrEqual(32);
    claim.checkpoint = JSON.parse(stableJson(checkpoint));
    repo.commit = async (i) => {
      saved = i;
      return true;
    };
    expect((await runLabWorkerChunk(repo, "new-token")).committed).toBe(true);
    expect(
      (saved as { checkpoint: NonNullable<LabClaim["checkpoint"]> }).checkpoint.steps,
    ).toBeGreaterThan(checkpoint!.steps);
  });
  it("does not claim fake work and reports engine corruption as a durable failure", async () => {
    expect(
      await runLabWorkerChunk(
        {
          claim: async () => null,
          commit: async () => {
            throw Error("unreachable");
          },
        },
        "token",
      ),
    ).toEqual({ claimed: false, committed: false });
    let error: string | null = null;
    await runLabWorkerChunk(
      {
        claim: async () => ({
          id: "j",
          lease_token: "l",
          completed_games: 0,
          engine_version: "unknown",
          config: job,
          checkpoint: null,
        }),
        commit: async (i) => {
          error = i.error;
          return true;
        },
      },
      "t",
    );
    expect(error).toBe("ENGINE_VERSION_MISMATCH");
  });
});
