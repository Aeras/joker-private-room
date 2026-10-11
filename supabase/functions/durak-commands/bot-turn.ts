import { durakDealTiming } from "./dealTiming.ts";
import { applyDurakMove, legalDurakMoves, type DurakMatch } from "./engine.ts";
import { chooseDurakBotMove } from "./bot.ts";
import { recordDurakPlay } from "./presentation.ts";

/** One visible decision per persisted deadline, regardless of polling clients. */
export const DURAK_BOT_REACTION_MS = 850;
export function startDurakDeal(state: DurakMatch, now: number): DurakMatch {
  const started = now + 1000;
  const ready = started + durakDealTiming(state.hands.length).duration;
  return {
    ...state,
    dealStartedAt: started,
    dealReadyAt: ready,
    nextBotAt: ready + DURAK_BOT_REACTION_MS,
  };
}
export function scheduleDurakBot(state: DurakMatch, now: number): DurakMatch {
  return { ...state, nextBotAt: now + DURAK_BOT_REACTION_MS };
}
export function advanceDurakBot(
  state: DurakMatch,
  seats: ReadonlyArray<{ index: number; occupant: string }>,
  now: number,
): DurakMatch {
  if (state.ended || now < (state.dealReadyAt ?? 0) || now < (state.nextBotAt ?? 0)) return state;
  const uncovered = state.pairs.some((pair) => !pair.defense) && !state.taking;
  const defender = seats.find((seat) => seat.index === state.defender);
  // Preserve human choices; only automate a canonical action when no card choice remains.
  if (uncovered && defender?.occupant !== "bot") {
    if (defender?.occupant !== "human") return state;
    const legal = legalDurakMoves(state, defender.index);
    if (legal.some((move) => move.type === "defend" || move.type === "transfer")) return state;
    const take = legal.find((move) => move.type === "take");
    if (!take) return state;
    return scheduleDurakBot(
      recordDurakPlay(state, applyDurakMove(state, defender.index, take), defender.index, take),
      now,
    );
  }
  const candidates = uncovered
    ? seats.filter((seat) => seat.index === state.defender)
    : seats.filter((seat) => seat.index !== state.defender);
  for (const seat of candidates) {
    if (seat.occupant !== "human") continue;
    const legal = legalDurakMoves(state, seat.index);
    if (legal.some((move) => move.type === "attack")) continue;
    const finish = legal.find((move) => move.type === "finish");
    if (!finish) continue;
    return scheduleDurakBot(
      recordDurakPlay(state, applyDurakMove(state, seat.index, finish), seat.index, finish),
      now,
    );
  }
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
