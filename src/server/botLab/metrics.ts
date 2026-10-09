import type { LabTier, SimulationResult } from "./simulation.server";
import { LAB_TIERS } from "./simulation.server";
export interface TierStatistics {
  starts: number;
  participations: number;
  outrightWins: number;
  tiedWins: number;
  winShare: number;
  meanScore: number | null;
  medianScore: number | null;
  exactByDealSize: Record<number, { deals: number; exact: number; under: number; over: number }>;
  penalties: number;
  penaltyPoints: number;
  jokerModes: Record<string, number>;
  jokerTricksWon: number;
  jokerTricksLost: number;
  premiaAwards: number;
  premiaBonusPoints: number;
  premiaRemovedPoints: number;
  decisionLatency: { p50: number | null; p95: number | null; p99: number | null };
}
export function quantile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * p;
  const low = Math.floor(position),
    high = Math.ceil(position);
  return sorted[low]! + (sorted[high]! - sorted[low]!) * (position - low);
}
export function summarizeGames(
  games: readonly SimulationResult[],
): Record<LabTier, TierStatistics> {
  return Object.fromEntries(
    LAB_TIERS.map((tier) => {
      const scores: number[] = [],
        latencies: number[] = [];
      const stats: TierStatistics = {
        starts: 0,
        participations: 0,
        outrightWins: 0,
        tiedWins: 0,
        winShare: 0,
        meanScore: null,
        medianScore: null,
        exactByDealSize: {},
        penalties: 0,
        penaltyPoints: 0,
        jokerModes: {},
        jokerTricksWon: 0,
        jokerTricksLost: 0,
        premiaAwards: 0,
        premiaBonusPoints: 0,
        premiaRemovedPoints: 0,
        decisionLatency: { p50: null, p95: null, p99: null },
      };
      for (const game of games) {
        const winners = game.placements.filter((rank) => rank === 1).length;
        for (let seat = 0; seat < 4; seat++) {
          if (game.physicalLineup[seat] !== tier) continue;
          stats.starts++;
          stats.participations++;
          scores.push(game.scores[seat]!);
          if (game.placements[seat] === 1) {
            if (winners === 1) stats.outrightWins++;
            else stats.tiedWins++;
            stats.winShare += 1 / winners;
          }
          for (const deal of game.deals) {
            const row = (stats.exactByDealSize[deal.cardsPerPlayer] ??= {
              deals: 0,
              exact: 0,
              under: 0,
              over: 0,
            });
            row.deals++;
            const taken = deal.tricksTaken[seat]!,
              bid = deal.declarations[seat]!;
            if (taken === bid) row.exact++;
            else if (taken < bid) row.under++;
            else row.over++;
            if (deal.dealScores[seat]! < 0) {
              stats.penalties++;
              stats.penaltyPoints -= deal.dealScores[seat]!;
            }
          }
          for (const round of game.premia)
            for (const transfer of round.transfers) {
              if (transfer.bonusSeat === seat) {
                stats.premiaAwards++;
                stats.premiaBonusPoints += transfer.bonusAmount;
              }
              if (transfer.targetSeat === seat) stats.premiaRemovedPoints += transfer.removedAmount;
            }
          for (const decision of game.decisions) {
            if (decision.seat !== seat) continue;
            latencies.push(decision.latencyMs);
            if (decision.command.type === "choose_joker_semantic") {
              const mode = decision.command.semantic.mode;
              stats.jokerModes[mode] = (stats.jokerModes[mode] ?? 0) + 1;
            }
          }
          for (const trick of game.tricks)
            for (const play of trick.cards) {
              if (play.seatIndex !== seat || play.card.kind !== "joker") continue;
              if (trick.winnerSeat === seat) stats.jokerTricksWon++;
              else stats.jokerTricksLost++;
            }
        }
      }
      stats.meanScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
      stats.medianScore = quantile(scores, 0.5);
      stats.decisionLatency = {
        p50: quantile(latencies, 0.5),
        p95: quantile(latencies, 0.95),
        p99: quantile(latencies, 0.99),
      };
      return [tier, stats];
    }),
  ) as Record<LabTier, TierStatistics>;
}

/** Cluster paired score deltas by independent seed. Repeated rotations are not
 * independent observations. CI is intentionally absent for fewer than 30
 * independent seeds; a pilot must not be sold as statistically proven. */
export function pairedScoreComparison(
  baseline: readonly SimulationResult[],
  candidate: readonly SimulationResult[],
  lineupSlot: number,
) {
  if (!Number.isInteger(lineupSlot) || lineupSlot < 0 || lineupSlot > 3)
    throw new Error("Invalid lineup slot");
  const key = (game: SimulationResult) =>
    `${game.config.seed}/${game.config.rotation ?? 0}/${game.config.ruleset}/${game.config.lineup.join(",")}`;
  const before = new Map(baseline.map((game) => [key(game), game]));
  if (before.size !== baseline.length) throw new Error("Duplicate baseline game");
  const seen = new Set<string>(),
    clusters = new Map<number, number[]>();
  for (const game of candidate) {
    const k = key(game),
      old = before.get(k);
    if (!old || seen.has(k)) throw new Error("Unmatched or duplicate comparison game");
    seen.add(k);
    if (old.selectedDealer !== game.selectedDealer) throw new Error("Unmatched dealer");
    const seat = (lineupSlot + (game.config.rotation ?? 0)) % 4;
    const row = clusters.get(game.config.seed) ?? [];
    row.push(game.scores[seat]! - old.scores[seat]!);
    clusters.set(game.config.seed, row);
  }
  if (seen.size !== before.size) throw new Error("Missing comparison games");
  const deltas = [...clusters.values()].map((row) => row.reduce((a, b) => a + b, 0) / row.length);
  const n = deltas.length;
  const mean = n ? deltas.reduce((a, b) => a + b, 0) / n : null;
  const variance =
    n > 1 ? deltas.reduce((sum, value) => sum + (value - mean!) ** 2, 0) / (n - 1) : 0;
  const half = 1.96 * Math.sqrt(variance / Math.max(1, n));
  return {
    independentSeeds: n,
    matchedGames: seen.size,
    meanScoreDelta: mean,
    approximate95CI: n >= 30 ? [mean! - half, mean! + half] : null,
  };
}
