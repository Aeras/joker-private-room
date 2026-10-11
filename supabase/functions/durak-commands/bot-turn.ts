import { applyDurakMove, legalDurakMoves, type DurakMatch } from "./engine.ts";
import { chooseDurakBotMove } from "./bot.ts";
import { recordDurakPlay } from "./presentation.ts";

/** One visible decision per persisted deadline, regardless of polling clients. */
export const DURAK_BOT_REACTION_MS = 850;
export function scheduleDurakBot(state: DurakMatch, now: number): DurakMatch {
  return { ...state, nextBotAt: now + DURAK_BOT_REACTION_MS };
}
export function advanceDurakBot(
  state: DurakMatch,
  seats: ReadonlyArray<{ index: number; occupant: string }>,
  now: number,
): DurakMatch {
  if (state.ended || now < (state.nextBotAt ?? 0)) return state;
  const uncovered = state.pairs.some((pair) => !pair.defense) && !state.taking;
  const defender = seats.find((seat) => seat.index === state.defender);
  // Let the defender respond before bots continue adding attacks.
  if (uncovered && defender?.occupant !== "bot") return state;
  const candidates = uncovered
    ? seats.filter((seat) => seat.index === state.defender)
    : seats.filter((seat) => seat.index !== state.defender);
  const bot = candidates.find(
    (seat) => seat.occupant === "bot" && legalDurakMoves(state, seat.index).length > 0,
  );
  if (!bot) return state;
  const move = chooseDurakBotMove(state, bot.index, "balanced");
  if (!move) return state;
  return scheduleDurakBot(
    recordDurakPlay(state, applyDurakMove(state, bot.index, move), bot.index, move),
    now,
  );
}
