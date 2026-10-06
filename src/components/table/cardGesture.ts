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

export interface CardDropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Presentation-only intent classifier. It never decides legality or mutates game state.
 * Touch/pen keeps the compact upward drag/flick gesture.
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

export function pointInsideCardDropRect(
  x: number,
  y: number,
  rect: CardDropRect | null | undefined,
): boolean {
  if (!rect) return false;
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Desktop mouse interaction is a real drag/drop: releasing over the visible felt commits.
 * Other pointer types preserve the established upward gesture so mobile behavior does not drift.
 */
export function shouldCommitCardRelease(input: {
  pointerType: string;
  clientX: number;
  clientY: number;
  dropRect?: CardDropRect | null;
  gesture: CardGestureSample;
}): boolean {
  if (input.pointerType === "mouse" && pointInsideCardDropRect(input.clientX, input.clientY, input.dropRect)) {
    return true;
  }
  return shouldCommitCardGesture(input.gesture);
}
