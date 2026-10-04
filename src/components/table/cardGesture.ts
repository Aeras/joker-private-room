export const CARD_DRAG_COMMIT_PX = 56;
export const CARD_FLICK_MIN_PX = 24;
export const CARD_FLICK_MIN_VELOCITY_PX_PER_MS = 0.65;
export const CARD_MAX_SIDEWAYS_PX = 52;
export const CARD_MAX_SIDEWAYS_RATIO = 1.2;

export interface CardGestureSample {
  deltaX: number;
  deltaY: number;
  durationMs: number;
}

/**
 * Presentation-only intent classifier. It never decides legality or mutates game state.
 * A commit requires a clearly upward motion and either enough displacement or a fast flick.
 */
export function shouldCommitCardGesture({ deltaX, deltaY, durationMs }: CardGestureSample): boolean {
  const upward = -deltaY;
  if (upward <= 0) return false;

  const sideways = Math.abs(deltaX);
  const sidewaysLimit = Math.max(CARD_MAX_SIDEWAYS_PX, upward * CARD_MAX_SIDEWAYS_RATIO);
  if (sideways > sidewaysLimit) return false;

  if (upward >= CARD_DRAG_COMMIT_PX) return true;

  const velocity = upward / Math.max(1, durationMs);
  return upward >= CARD_FLICK_MIN_PX && velocity >= CARD_FLICK_MIN_VELOCITY_PX_PER_MS;
}
