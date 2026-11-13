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
    return { x: 640 + offset * 17, y: 88 + Math.abs(offset) * 1.4, angle: offset * 1.5 };
  }
  // Lay the side cards in an elegant curve that hugs the table's golden-brown wooden rail.
  // The apex is vertically centered with the table oval (y ~ 350), with a smooth,
  // gentle arc and tight angular spread so the cards remain compact and uniform.
  const bend = offset * offset * 0.65;
  if (side === "left") {
    return { x: 68 + bend, y: 350 + offset * 13, angle: 90 - offset * 1.8 };
  }
  return { x: 1212 - bend, y: 350 + offset * 13, angle: -90 + offset * 1.8 };
}
