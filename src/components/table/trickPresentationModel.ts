import type { PlayedCard } from "@/domain/engine";

export const NORMAL_TRICK_PLAY_SPACING_MS = 500;
export const REDUCED_TRICK_PLAY_SPACING_MS = 100;
export const NORMAL_TRICK_HOLD_MS = 850;
export const NORMAL_TRICK_COLLECT_MS = 260;
export const REDUCED_TRICK_HOLD_MS = 180;
export const REDUCED_TRICK_COLLECT_MS = 100;
export const COLLISION_FAST_FORWARD_MS = 140;

export function completedTrickPresentationId(input: {
  gameId: string;
  dealNumber: number;
  trickOrdinal: number;
  cards: readonly PlayedCard[];
  winnerSeat: number;
}): string {
  const orderedCards = input.cards
    .map((play) => `${play.seatIndex}:${play.card.id}`)
    .join(",");
  return [
    input.gameId,
    `deal:${input.dealNumber}`,
    `trick:${input.trickOrdinal}`,
    `cards:${orderedCards}`,
    `winner:${input.winnerSeat}`,
  ].join("|");
}

export function trickPresentationTiming(reducedMotion: boolean) {
  const playSpacingMs = reducedMotion ? REDUCED_TRICK_PLAY_SPACING_MS : NORMAL_TRICK_PLAY_SPACING_MS;
  const holdMs = reducedMotion ? REDUCED_TRICK_HOLD_MS : NORMAL_TRICK_HOLD_MS;
  const collectMs = reducedMotion ? REDUCED_TRICK_COLLECT_MS : NORMAL_TRICK_COLLECT_MS;
  return { playSpacingMs, holdMs, clearMs: holdMs + collectMs };
}
