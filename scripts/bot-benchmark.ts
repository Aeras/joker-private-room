import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  simulateFullGame,
  seededRandom,
  LAB_TIERS,
  BASELINE_STRATEGY_VERSION,
  type LabLineup,
} from "../src/server/botLab/simulation.server";
import { summarizeGames } from "../src/server/botLab/metrics";
import { RULESETS, type RulesetId } from "../src/domain/rulesets";
import type { SeatIndex } from "../src/domain/dealing";
const count = Number(process.argv[2] ?? 10);
const seed = Number(process.argv[3] ?? 20261009);
const ruleset = (process.argv[4] ?? "popular") as RulesetId;
if (
  ![10, 100, 1000, 5000].includes(count) ||
  !Object.hasOwn(RULESETS, ruleset) ||
  !Number.isInteger(seed) ||
  seed < 0 ||
  seed > 0xffffffff
)
  throw new Error("Usage: bun scripts/bot-benchmark.ts [10|100|1000|5000] [uint32 seed] [ruleset]");
const random = seededRandom(seed ^ 0x6a09e667);
const games = [];
const started = performance.now();
for (let index = 0; index < count; index++) {
  // Four seats per group; the same lineup and deck seed receive all rotations.
  const group = Math.floor(index / 4);
  const lineup: LabLineup =
    index % 4 === 0
      ? (Array.from({ length: 4 }, () => LAB_TIERS[Math.floor(random() * 3)]!) as LabLineup)
      : games.at(-1)!.config.lineup;
  games.push(
    simulateFullGame({
      seed: (seed + group) >>> 0,
      ruleset,
      lineup,
      rotation: (index % 4) as SeatIndex,
      strategyVersion: BASELINE_STRATEGY_VERSION,
    }),
  );
  if ((index + 1) % 10 === 0)
    process.stdout.write(`${index + 1}/${count} canonical games completed\n`);
}
const output = resolve(".test-tmp", `bot-benchmark-${ruleset}-${seed}-${count}.json`);
await mkdir(resolve(".test-tmp"), { recursive: true });
await writeFile(
  output,
  JSON.stringify(
    {
      strategyVersion: BASELINE_STRATEGY_VERSION,
      count,
      independentSeeds: Math.ceil(count / 4),
      balancedCompleteGroups: Math.floor(count / 4),
      partialRotationGames: count % 4,
      ruleset,
      elapsedMs: performance.now() - started,
      statistics: summarizeGames(games),
      games,
    },
    null,
    2,
  ),
);
process.stdout.write(`Actual results: ${output}\n`);
