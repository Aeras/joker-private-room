export type BiribaOpponentSide = "top" | "left" | "right";

export const BIRIBA_CARD_BACK_WIDTH = 70;
export const BIRIBA_CARD_BACK_HEIGHT = 100;

/** Canvas-space center/angle of an opponent's visible card back. */
export function opponentFanPose(
  side: BiribaOpponentSide,
  index: number,
  count: number,
): { x: number; y: number; angle: number } {
  const shown = Math.max(1, Math.min(count, 14));
  const offset = index - (shown - 1) / 2;
  if (side === "top") {
    return { x: 640 + offset * 17, y: 108 + Math.abs(offset) * 1.5, angle: offset * 1.5 };
  }
  // Lay the side cards horizontally from the local player's viewpoint. Their
  // outer ends spread apart while their inner ends converge near the avatar;
  // the centers also follow the oval rim as the hand grows or shrinks.
  const bend = offset * offset * 0.9;
  if (side === "left") {
    return { x: 72 + bend, y: 322 + offset * 14, angle: 90 - offset * 2.5 };
  }
  return { x: 1208 - bend, y: 322 + offset * 14, angle: -90 + offset * 2.5 };
}
