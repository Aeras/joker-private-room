import type { PlayedCard } from "@/domain/engine";

// Bottom, left, top, right: upright to the player who played the card.
// Keep the existing small natural tilts, shared by local flight and table ownership.
export const TRICK_CARD_ROTATION = [2, 83, 178, -83] as const;

import { NORMAL_TRICK_SETTLE_MS, NORMAL_TRICK_INTER_PLAY_BEAT_MS, REDUCED_TRICK_SETTLE_MS, REDUCED_TRICK_INTER_PLAY_BEAT_MS, NORMAL_TRICK_HOLD_MS, NORMAL_TRICK_STACK_MS, NORMAL_TRICK_COLLECT_MS, REDUCED_TRICK_HOLD_MS, REDUCED_TRICK_STACK_MS, REDUCED_TRICK_COLLECT_MS } from "./presentationTiming";
export { NORMAL_TRICK_SETTLE_MS, NORMAL_FROM_BELOW_FLIGHT_MS, NORMAL_FROM_BELOW_FLIP_MS, NORMAL_TRICK_INTER_PLAY_BEAT_MS, NORMAL_TRICK_PLAY_SPACING_MS, REDUCED_TRICK_SETTLE_MS, REDUCED_TRICK_INTER_PLAY_BEAT_MS, REDUCED_TRICK_PLAY_SPACING_MS, NORMAL_TRICK_HOLD_MS, NORMAL_TRICK_STACK_MS, NORMAL_TRICK_COLLECT_MS, REDUCED_TRICK_HOLD_MS, REDUCED_TRICK_STACK_MS, REDUCED_TRICK_COLLECT_MS, COLLISION_FAST_FORWARD_MS } from "./presentationTiming";
export function completedTrickPresentationId(input: {
  gameId: string;
  dealNumber: number;
  trickOrdinal: number;
  cards: readonly PlayedCard[];
  winnerSeat: number;
}): string {
  const orderedCards = input.cards.map((play) => `${play.seatIndex}:${play.card.id}`).join(",");
  return [input.gameId, `deal:${input.dealNumber}`, `trick:${input.trickOrdinal}`, `cards:${orderedCards}`, `winner:${input.winnerSeat}`].join("|");
}

export function trickPresentationTiming(reducedMotion: boolean) {
  const settleMs = reducedMotion ? REDUCED_TRICK_SETTLE_MS : NORMAL_TRICK_SETTLE_MS;
  const interPlayBeatMs = reducedMotion ? REDUCED_TRICK_INTER_PLAY_BEAT_MS : NORMAL_TRICK_INTER_PLAY_BEAT_MS;
  const playSpacingMs = settleMs + interPlayBeatMs;
  const holdMs = reducedMotion ? REDUCED_TRICK_HOLD_MS : NORMAL_TRICK_HOLD_MS;
  const stackMs = reducedMotion ? REDUCED_TRICK_STACK_MS : NORMAL_TRICK_STACK_MS;
  const collectMs = reducedMotion ? REDUCED_TRICK_COLLECT_MS : NORMAL_TRICK_COLLECT_MS;
  return {
    playSpacingMs,
    settleMs,
    interPlayBeatMs,
    holdMs,
    stackMs,
    collectMs,
    collectStartMs: settleMs + holdMs + stackMs,
    clearMs: settleMs + holdMs + stackMs + collectMs,
  };
}
