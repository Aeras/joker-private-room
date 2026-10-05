import type { PlayedCard } from "@/domain/engine";

// Keep live bot/remote plays visibly sequential. The next visible play should not
// begin until the previous card has had time to settle on the felt.
export const NORMAL_TRICK_PLAY_SPACING_MS = 650;
export const REDUCED_TRICK_PLAY_SPACING_MS = 120;
export const NORMAL_TRICK_HOLD_MS = 900;
export const NORMAL_TRICK_COLLECT_MS = 300;
export const REDUCED_TRICK_HOLD_MS = 180;
export const REDUCED_TRICK_COLLECT_MS = 100;
export const COLLISION_FAST_FORWARD_MS = 160;

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
