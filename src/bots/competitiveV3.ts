import { RANK_VALUE, type Card, type Suit } from "@/domain/cards";
import { requestedSuitForTrick, resolveTrick, type PlayedCard } from "@/domain/engine";
import { completeActions } from "./competitive";

/**
 * Experimental v3 late-trick policy. Purely local and public information.
 * Deliberately NOT wired into production automatic bot selection until verified.
 */
export function chooseExactProtectionPlay(args: {
  hand: readonly Card[];
  trick: readonly PlayedCard[];
  trump: Suit | null;
  seat: number;
  bid: number;
  taken: number;
  remaining: number;
}): PlayedCard {
  const { hand, trick, trump, seat, bid, taken, remaining } = args;
  const actions = completeActions(hand, trick, trump, seat);
  if (!actions.length) throw new Error("NO_LEGAL_ACTION");
  const need = bid - taken;
  const protecting = need === 0;
  const mustWin = need >= remaining && need > 0;
  const leadSuit = requestedSuitForTrick(trick);

  function cardPower(card: Card): number {
    if (card.kind === "joker") return 20;
    return RANK_VALUE[card.rank] + (card.suit === trump ? 12 : 0);
  }
  function danger(handAfter: readonly Card[]): number {
    if (!handAfter.length) return 0;
    // High uncontested cards left for forced future leads are dangerous when
    // protecting exact. A Joker is a flexible but potentially unavoidable win.
    return handAfter.reduce((sum, card) => {
      const power = cardPower(card);
      return sum + (power >= 17 ? 3 : power >= 12 ? 1.5 : power >= 8 ? 0.4 : 0);
    }, 0);
  }
  function apparentWin(action: PlayedCard): boolean {
    const partial = [...trick, action];
    if (partial.length === 4) return resolveTrick({ plays: partial, trump }).winnerSeat === seat;
    if (action.joker?.mode === "FROM_BELOW") return false;
    if (action.joker?.mode === "COMPETE") return true;
    // When following, trump or a higher card of the requested suit is a
    // plausible current win; later actors may still overtake.
    if (trick.length) {
      const rival = trick.filter(p => p.card.kind === "standard");
      if (action.card.kind === "joker") return action.joker?.mode !== "FROM_BELOW";
      const ownTrump = trump != null && action.card.suit === trump;
      const theirTrump = rival.filter(p => p.card.kind === "standard" && p.card.suit === trump);
      if (theirTrump.length) return ownTrump && cardPower(action.card) > Math.max(...theirTrump.map(p => cardPower(p.card)));
      if (ownTrump && action.card.suit !== leadSuit) return true;
      const following = rival.filter(p => p.card.kind === "standard" && p.card.suit === leadSuit);
      return action.card.suit === leadSuit && following.every(p => cardPower(action.card) > cardPower(p.card));
    }
    return true; // Every legal lead may win; choose safer resource disposal.
  }
  return actions.reduce((best, action) => {
    const score = (play: PlayedCard): number => {
      const win = apparentWin(play);
      const after = hand.filter(c => c.id !== play.card.id);
      const resource = cardPower(play.card);
      if (protecting) {
        return (win ? -100 : 100) - danger(after) * 2 + resource * 0.3 +
          (play.joker?.mode === "FROM_BELOW" ? 2 : 0);
      }
      if (mustWin) return (win ? 100 : -100) - resource * 0.3;
      // Do not burn high cards or Jokers if there are enough future tricks.
      return (win ? 12 : 0) - resource * 0.4 - (play.card.kind === "joker" ? 8 : 0);
    };
    const diff = score(action) - score(best);
    return diff > 0 || (diff === 0 && action.card.id < best.card.id) ? action : best;
  }, actions[0]!);
}
