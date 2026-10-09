import type { PlayerGameProjection } from "@/domain/projection";
import { selectBaselineGameplayCommand } from "./baselineRuntime";
import { analyzeCompetitive, COMPETITIVE_VERSION, type CompetitiveTier } from "./competitive";

/** Catalog tier IDs remain compatible with existing games and temporary
 * takeovers. The explicit algorithm version identifies the new policy. */
export function selectCompetitiveCommand(projection: PlayerGameProjection) {
  const fallback = selectBaselineGameplayCommand(projection);
  if (!fallback) return null;
  // Complete even a budget/failure fallback before persistence. The historical
  // baseline remains unchanged for matched-seed benchmarking and legacy states.
  if (fallback.command.type === "play_card") {
    const cardId = fallback.command.cardId;
    const joker = projection.cards.ownHand.find(card => card.id === cardId && card.kind === "joker");
    const options = projection.local.legalActions.find(action => action.type === "play_card")?.jokerOptions;
    if (joker && options?.length) {
      const choice = selectBaselineGameplayCommand({ ...projection,
        progression: { ...projection.progression, phase: "JOKER_DECISION" },
        cards: { ...projection.cards, currentTrick: [...projection.cards.currentTrick, { seatIndex: projection.viewerSeat, card: joker }] },
        local: { ...projection.local, legalActions: [{ type: "choose_joker_semantic", options }] },
      });
      if (choice?.command.type !== "choose_joker_semantic") return null;
      fallback.command = { ...fallback.command, jokerSemantic: choice.command.semantic };
    }
  }
  const id = fallback.strategyId;
  const tier: CompetitiveTier =
    id === "probability-simulation-v1" ? 3 : id === "memory-inference-v1" ? 2 : 1;
  try {
    const report = analyzeCompetitive(projection, tier, fallback.command);
    return { ...fallback, command: report.command, strategyVersion: COMPETITIVE_VERSION, report };
  } catch {
    return { ...fallback, strategyVersion: COMPETITIVE_VERSION, report: null };
  }
}
