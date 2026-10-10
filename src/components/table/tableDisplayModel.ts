import { DEALS, dealsOfPhase } from "@/domain/gameConfig";
import type { PlayerGameProjection } from "@/domain/projection";
import { t } from "@/i18n/el";

export function compactRoundProgress(dealNumber: number): string {
  const deal = DEALS.find(d => d.dealNumber === dealNumber);
  return deal ? `${t.round} ${deal.phase} · ${deal.indexInPhase}/${dealsOfPhase(deal.phase).length}` : t.appName;
}

/** Only public plays and public stage metadata; never reads another hand. */
export function publicRemainingCardCount(projection: PlayerGameProjection, seat: number): number {
  const phase = projection.progression.phase;
  if (phase === "DEAL_SETUP" || phase === "INITIAL_DEALER_SELECTION") return 0;
  const dealt = phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" || phase === "NINE_CARD_TRUMP_CHOICE" ? 3 : projection.progression.cardsPerPlayer;
  const played = projection.cards.completedTricks.reduce((count, trick) => count + trick.cards.filter(play => play.seatIndex === seat).length, 0)
    + projection.cards.currentTrick.filter(play => play.seatIndex === seat).length;
  return Math.max(0, dealt - played);
}
