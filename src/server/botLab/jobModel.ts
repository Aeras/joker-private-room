import { RULESETS, type RulesetId } from "@/domain/rulesets";
import { COMPETITIVE_VERSION } from "@/bots/competitive";
import {
  BASELINE_STRATEGY_VERSION,
  LAB_TIERS,
  seededRandom,
  type LabLineup,
  type SimulationConfig,
  type SimulationResult,
} from "./simulation.server";
export const LAB_ENGINE_VERSION = "lab-engine-v1";
export interface LabJobConfig {
  games: 10 | 100 | 1000 | 5000;
  seed: number;
  ruleset: RulesetId;
  lineup: LabLineup | null;
  compare: boolean;
}
export function validateLabJobConfig(value: unknown): LabJobConfig {
  if (!value || typeof value !== "object") throw Error("INVALID_CONFIG");
  const v = value as Record<string, unknown>;
  if (
    ![10, 100, 1000, 5000].includes(v["games"] as number) ||
    !Number.isInteger(v["seed"]) ||
    (v["seed"] as number) < 0 ||
    (v["seed"] as number) > 0xffffffff - 1250 ||
    typeof v["ruleset"] !== "string" ||
    !Object.hasOwn(RULESETS, v["ruleset"]) ||
    typeof v["compare"] !== "boolean" ||
    !(
      v["lineup"] === null ||
      (Array.isArray(v["lineup"]) &&
        v["lineup"].length === 4 &&
        v["lineup"].every((t) => LAB_TIERS.includes(t)))
    )
  )
    throw Error("INVALID_CONFIG");
  return {
    games: v["games"] as LabJobConfig["games"],
    seed: v["seed"] as number,
    ruleset: v["ruleset"] as RulesetId,
    lineup: v["lineup"] as LabLineup | null,
    compare: v["compare"],
  };
}
/** Comparison replaces only lineup slot zero. Seeds/lineup/dealer/decks match;
 * every complete four-game group rotates the target across all seats. */
export function configForJobGame(job: LabJobConfig, index: number): SimulationConfig {
  validateLabJobConfig(job);
  const total = job.games * (job.compare ? 2 : 1);
  if (!Number.isInteger(index) || index < 0 || index >= total) throw Error("INVALID_GAME_INDEX");
  const logical = Math.floor(index / (job.compare ? 2 : 1)),
    seed = job.seed + Math.floor(logical / 4);
  const random = seededRandom(seed ^ 0x51ed270b);
  const lineup =
    job.lineup ??
    (Array.from({ length: 4 }, () => LAB_TIERS[Math.floor(random() * 3)]!) as LabLineup);
  const base = {
    seed,
    ruleset: job.ruleset,
    lineup,
    rotation: (logical % 4) as 0 | 1 | 2 | 3,
    strategyVersion: job.compare ? BASELINE_STRATEGY_VERSION : COMPETITIVE_VERSION,
  };
  return job.compare && index % 2 === 1
    ? {
        ...base,
        seatVersions: [
          COMPETITIVE_VERSION,
          BASELINE_STRATEGY_VERSION,
          BASELINE_STRATEGY_VERSION,
          BASELINE_STRATEGY_VERSION,
        ],
      }
    : base;
}
export const LATENCY_BOUNDS = [
  0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
] as const;
export interface CompactSeatMetrics {
  tier: string;
  version: string;
  score: number;
  winShare: number;
  outright: number;
  tied: number;
  exact: number[];
  under: number[];
  over: number[];
  penalties: number;
  penaltyPoints: number;
  jokerModes: Record<string, number>;
  jokerWon: number;
  jokerLost: number;
  premia: number;
  bonusPoints: number;
  removedPoints: number;
  latencyHistogram: number[];
}
export function compactLabResult(game: SimulationResult) {
  const metrics: CompactSeatMetrics[] = game.physicalLineup.map((tier, seat) => {
    const version =
      game.config.seatVersions?.[(seat - (game.config.rotation ?? 0) + 4) % 4] ??
      game.config.strategyVersion;
    const row: CompactSeatMetrics = {
      tier,
      version,
      score: game.scores[seat]!,
      winShare: game.placements[seat] === 1 ? 1 / game.placements.filter((p) => p === 1).length : 0,
      outright: Number(
        game.placements[seat] === 1 && game.placements.filter((p) => p === 1).length === 1,
      ),
      tied: Number(
        game.placements[seat] === 1 && game.placements.filter((p) => p === 1).length > 1,
      ),
      exact: Array(9).fill(0),
      under: Array(9).fill(0),
      over: Array(9).fill(0),
      penalties: 0,
      penaltyPoints: 0,
      jokerModes: {},
      jokerWon: 0,
      jokerLost: 0,
      premia: 0,
      bonusPoints: 0,
      removedPoints: 0,
      latencyHistogram: Array(LATENCY_BOUNDS.length + 1).fill(0),
    };
    for (const d of game.deals) {
      const bid = d.declarations[seat]!,
        taken = d.tricksTaken[seat]!,
        n = d.cardsPerPlayer - 1;
      row[taken === bid ? "exact" : taken < bid ? "under" : "over"][n]!++;
      if (d.dealScores[seat]! < 0) {
        row.penalties++;
        row.penaltyPoints -= d.dealScores[seat]!;
      }
    }
    for (const t of game.tricks)
      for (const p of t.cards)
        if (p.seatIndex === seat && p.joker) {
          row.jokerModes[p.joker.mode] = (row.jokerModes[p.joker.mode] ?? 0) + 1;
          row[t.winnerSeat === seat ? "jokerWon" : "jokerLost"]++;
        }
    for (const p of game.premia)
      for (const t of p.transfers) {
        if (t.bonusSeat === seat) {
          row.premia++;
          row.bonusPoints += t.bonusAmount;
        }
        if (t.targetSeat === seat) row.removedPoints += t.removedAmount;
      }
    for (const d of game.decisions.filter((d) => d.seat === seat)) {
      const bin = LATENCY_BOUNDS.findIndex((b) => d.latencyMs <= b);
      row.latencyHistogram[bin < 0 ? LATENCY_BOUNDS.length : bin]!++;
    }
    return row;
  });
  return {
    config: game.config,
    selectedDealer: game.selectedDealer,
    steps: game.steps,
    scores: game.scores,
    placements: game.placements,
    metrics,
    // One bounded synthetic-game inspection sample; never live-game data.
    inspection: game.decisions.slice(0, 20),
  };
}
