import { durakAttackSeats, type DurakMatch, type DurakMove } from "./engine.ts";

export const DURAK_PUBLIC_HISTORY_LIMIT = 32;

/** Record only the card already exposed by an accepted move, before round cleanup. */
export function recordDurakPlay(
  before: DurakMatch,
  after: DurakMatch,
  seat: number,
  move: DurakMove,
): DurakMatch {
  if (!("card" in move)) return after;
  const pairs = before.pairs.map((pair) => ({ ...pair }));
  if (move.type === "defend") pairs[move.pair] = { ...pairs[move.pair]!, defense: move.card };
  else pairs.push({ attack: move.card });
  const sequence = (before.presentationSequence ?? 0) + 1;
  const handSizes = before.hands.map((hand, index) => hand.length - (index === seat ? 1 : 0));
  const roles = after.round === before.round && !after.ended ? after : before;
  return {
    ...after,
    presentationSequence: sequence,
    presentationEvents: [
      ...(before.presentationEvents ?? []),
      {
        sequence,
        seat,
        card: move.card,
        kind: move.type,
        round: before.round,
        attacker: roles.primaryAttacker,
        defender: roles.defender,
        attackSeats: durakAttackSeats(roles),
        pairs,
        handSizes,
      },
    ].slice(-DURAK_PUBLIC_HISTORY_LIMIT),
  };
}
