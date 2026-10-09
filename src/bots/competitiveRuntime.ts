import type { PlayerGameProjection } from "@/domain/projection";
import { selectBaselineGameplayCommand } from "./baselineRuntime";
import { analyzeCompetitive, COMPETITIVE_VERSION, type CompetitiveTier } from "./competitive";
import { chooseExactProtectionPlay } from "./competitiveV3";
import { observeBot } from "./observation";

export const COMPETITIVE_V3_VERSION = "competitive-v3";

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
    // V3 applies to late tricks after a confirmed declaration; all other
    // phases retain the proven V2 search. The canonical engine still validates
    // every card and Joker meaning. A failed V3 evaluation falls back to V2.
    const observation = observeBot(projection);
    const ownBid = observation.declarations[observation.identity.seat];
    if (projection.progression.phase === "CARD_PLAY" &&
        ownBid !== null && ownBid !== undefined &&
        observation.ownHand.length > 0 && observation.ownHand.length <= 2) {
      try {
        const choice = chooseExactProtectionPlay({
          hand: observation.ownHand,
          trick: observation.committedTrick,
          trump: observation.trump,
          seat: observation.identity.seat,
          bid: ownBid,
          taken: observation.tricksTaken[observation.identity.seat]!,
          remaining: observation.ownHand.length,
        });
        const v3Command = { type: "play_card" as const, cardId: choice.card.id,
          ...(choice.joker ? { jokerSemantic: choice.joker } : {}) };
        const legal = projection.local.legalActions.find(a => a.type === "play_card");
        if (legal?.cardIds.includes(choice.card.id)) {
          return { ...fallback, command: v3Command, strategyVersion: COMPETITIVE_V3_VERSION, report };
        }
      } catch { /* Preserve V2 on any V3 evaluation failure. */ }
    }
    return { ...fallback, command: report.command, strategyVersion: COMPETITIVE_VERSION, report };
  } catch {
    return { ...fallback, strategyVersion: COMPETITIVE_VERSION, report: null };
  }
}
