import {
  durakAttackSeats,
  type DurakMatch,
  type DurakMove,
  type DurakPublicEvent,
} from "./engine.ts";
export const DURAK_PUBLIC_HISTORY_LIMIT = 32;
/** Old open tabs understand card plays only. Gaps cause their existing safe state resync. */
export function publicDurakEvents(state: DurakMatch, version: unknown): DurakPublicEvent[] {
  const events = state.presentationEvents ?? [];
  return version === 2 ? events : events.filter((event) => "card" in event);
}
/** Accepted public plays and resolved bouts, including closure by a non-card finish/take. */
export function recordDurakPlay(
  before: DurakMatch,
  after: DurakMatch,
  seat: number,
  move: DurakMove,
): DurakMatch {
  const closed = after.round > before.round || (!before.ended && after.ended);
  if (!("card" in move) && !closed) return after;
  const pairs = before.pairs.map((pair) => ({ ...pair }));
  const events: DurakPublicEvent[] = [];
  let sequence = before.presentationSequence ?? 0;
  if ("card" in move) {
    if (move.type === "defend") pairs[move.pair] = { ...pairs[move.pair]!, defense: move.card };
    else pairs.push({ attack: move.card });
    const roles = !closed ? after : before;
    events.push({
      sequence: ++sequence,
      seat,
      card: move.card,
      kind: move.type,
      round: before.round,
      attacker: roles.primaryAttacker,
      defender: roles.defender,
      attackSeats: durakAttackSeats(roles),
      pairs,
      handSizes: before.hands.map((hand, index) => hand.length - (index === seat ? 1 : 0)),
      discardCount: after.discard.length,
    });
  }
  if (closed)
    events.push({
      sequence: ++sequence,
      kind: after.discard.length > before.discard.length ? "discard" : "take",
      round: before.round,
      pairs,
      discardCount: after.discard.length,
    });
  return {
    ...after,
    presentationSequence: sequence,
    presentationEvents: [...(before.presentationEvents ?? []), ...events].slice(
      -DURAK_PUBLIC_HISTORY_LIMIT,
    ),
  };
}
