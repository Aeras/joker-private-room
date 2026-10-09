import { mkdir, writeFile } from "node:fs/promises";
import {
  simulateFullGame,
  LAB_TIERS,
  BASELINE_STRATEGY_VERSION,
  type SimulationResult,
} from "../src/server/botLab/simulation.server";
import { pairedScoreComparison, summarizeGames, quantile } from "../src/server/botLab/metrics";
import { RULESETS, type RulesetId } from "../src/domain/rulesets";
import { COMPETITIVE_VERSION } from "../src/bots/competitive";
const seeds = Number(process.argv[2] ?? 30),
  start = Number(process.argv[3] ?? 730000);
const ruleset = (process.argv[4] ?? "popular") as RulesetId;
if (
  !Number.isInteger(seeds) ||
  seeds < 1 ||
  seeds > 1000 ||
  !Number.isInteger(start) ||
  start < 0 ||
  start + seeds > 0xffffffff ||
  !Object.hasOwn(RULESETS, ruleset)
)
  throw Error("Invalid seeds");
const results = [];
for (const tier of LAB_TIERS) {
  const baseline: SimulationResult[] = [],
    candidate: SimulationResult[] = [];
  const began = performance.now();
  for (let seed = start; seed < start + seeds; seed++) {
    for (const rotation of [0, 1, 2, 3] as const) {
      const config = {
        seed,
        rotation,
        lineup: [tier, ...LAB_TIERS] as [typeof tier, typeof tier, typeof tier, typeof tier],
        ruleset,
        strategyVersion: BASELINE_STRATEGY_VERSION,
      };
      baseline.push(simulateFullGame(config));
      candidate.push(
        simulateFullGame({
          ...config,
          seatVersions: [
            COMPETITIVE_VERSION,
            BASELINE_STRATEGY_VERSION,
            BASELINE_STRATEGY_VERSION,
            BASELINE_STRATEGY_VERSION,
          ],
        }),
      );
    }
    process.stdout.write(
      `${tier}: ${seed - start + 1}/${seeds} independent seeds, ${baseline.length + candidate.length} actual games\n`,
    );
  }
  const clusterWins = [];
  for (let i = 0; i < baseline.length; i += 4) {
    let delta = 0;
    for (let j = 0; j < 4; j++) {
      const b = baseline[i + j]!,
        c = candidate[i + j]!,
        seat = j;
      const share = (g: SimulationResult) =>
        g.placements[seat] === 1 ? 1 / g.placements.filter((p) => p === 1).length : 0;
      delta += share(c) - share(b);
    }
    clusterWins.push(delta / 4);
  }
  const mean = clusterWins.reduce((a, b) => a + b, 0) / seeds;
  const variance =
    seeds > 1 ? clusterWins.reduce((s, d) => s + (d - mean) ** 2, 0) / (seeds - 1) : 0;
  const half = 1.96 * Math.sqrt(variance / seeds);
  const ownLatencies = candidate.flatMap((g) =>
    g.decisions.filter((d) => d.seat === (g.config.rotation ?? 0)).map((d) => d.latencyMs),
  );
  results.push({
    tier,
    seeds,
    games: baseline.length + candidate.length,
    elapsedMs: performance.now() - began,
    score: pairedScoreComparison(baseline, candidate, 0),
    winShareDelta: mean,
    approximate95WinShareCI: seeds >= 30 ? [mean - half, mean + half] : null,
    candidateDecisionMs: {
      p50: quantile(ownLatencies, 0.5),
      p95: quantile(ownLatencies, 0.95),
      p99: quantile(ownLatencies, 0.99),
    },
    baselineStats: summarizeGames(baseline),
    candidateStats: summarizeGames(candidate),
  });
  await mkdir(".test-tmp", { recursive: true });
  await writeFile(
    `.test-tmp/competitive-benchmark-${ruleset}-${start}-${seeds}.json`,
    JSON.stringify({ start, seeds, ruleset, results }, null, 2),
  );
  process.stdout.write(JSON.stringify(results.at(-1)) + "\n");
}
