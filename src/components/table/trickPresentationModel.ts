import type { PlayedCard } from "@/domain/engine";

// Bottom, left, top, right: upright to the player who played the card.
// Keep the existing small natural tilts, shared by local flight and table ownership.
export const TRICK_CARD_ROTATION = [2, 83, 178, -83] as const;

// Human-readable trick pacing is defined from the previous card's settled frame,
// not merely from when its animation started. This keeps bot/remote presentation
// independent from raw computation or reconciliation speed.
export const NORMAL_TRICK_SETTLE_MS = 340;
// Only FROM_BELOW travels and turns more slowly; all other card pacing stays intact.
export const NORMAL_FROM_BELOW_FLIGHT_MS = 450;
export const NORMAL_FROM_BELOW_FLIP_MS = 300;
export const NORMAL_TRICK_INTER_PLAY_BEAT_MS = 160;
export const NORMAL_TRICK_PLAY_SPACING_MS = NORMAL_TRICK_SETTLE_MS + NORMAL_TRICK_INTER_PLAY_BEAT_MS;
export const REDUCED_TRICK_SETTLE_MS = 80;
export const REDUCED_TRICK_INTER_PLAY_BEAT_MS = 120;
export const REDUCED_TRICK_PLAY_SPACING_MS = REDUCED_TRICK_SETTLE_MS + REDUCED_TRICK_INTER_PLAY_BEAT_MS;
export const NORMAL_TRICK_HOLD_MS = 550;
export const NORMAL_TRICK_STACK_MS = 250;
export const NORMAL_TRICK_COLLECT_MS = 380;
export const REDUCED_TRICK_HOLD_MS = 180;
export const REDUCED_TRICK_STACK_MS = 80;
export const REDUCED_TRICK_COLLECT_MS = 120;
export const COLLISION_FAST_FORWARD_MS = 160;

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
