import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from "../core/coordinateSystem";
import { CARD_WIDTH, CARD_HEIGHT } from "../objects/DurakCardSprite";

export type CardLayoutPose = {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly scale: number;
  readonly zIndex: number;
};

export type DurakLayoutEngine = {
  getStockPose: () => { x: number; y: number };
  getDiscardPose: () => { x: number; y: number };
  getSeatPose: (position: string) => { x: number; y: number };
  getBattlePairPose: (pairIndex: number, totalPairs: number) => { x: number; y: number };
  getLocalHandPose: (cardIndex: number, totalCards: number, isSelected?: boolean) => CardLayoutPose;
};

export const layoutEngine: DurakLayoutEngine = {
  getStockPose: () => ({
    x: 240,
    y: 520,
  }),

  getDiscardPose: () => ({
    x: 1680,
    y: 520,
  }),

  getSeatPose: (position: string) => {
    switch (position) {
      case "bottom":
        return { x: 340, y: 960 };
      case "left":
        return { x: 220, y: 320 };
      case "top-left":
        return { x: 580, y: 150 };
      case "top":
      case "top-center":
        return { x: 960, y: 140 };
      case "top-right":
        return { x: 1340, y: 150 };
      case "right":
        return { x: 1700, y: 320 };
      default:
        return { x: 960, y: 140 };
    }
  },

  getBattlePairPose: (pairIndex: number, totalPairs: number) => {
    const count = Math.max(1, totalPairs);
    // Spacing between attack/defense pairs
    const pairSpacing = Math.min(180, 860 / count);
    const startX = LOGICAL_WIDTH / 2 - ((count - 1) * pairSpacing) / 2;
    return {
      x: startX + pairIndex * pairSpacing,
      y: 510,
    };
  },

  getLocalHandPose: (cardIndex: number, totalCards: number, isSelected = false): CardLayoutPose => {
    if (totalCards <= 0) {
      return { x: LOGICAL_WIDTH / 2, y: 940, rotation: 0, scale: 1, zIndex: 0 };
    }

    const maxSpreadWidth = 1100;
    const baseSpacing = Math.min(85, maxSpreadWidth / totalCards);
    const mid = (totalCards - 1) / 2;
    const offsetFromMid = cardIndex - mid;

    const x = LOGICAL_WIDTH / 2 + offsetFromMid * baseSpacing;
    const normalizedOffset = mid > 0 ? offsetFromMid / mid : 0;

    // Natural subtle fan arc
    const arcLift = Math.abs(normalizedOffset) * 15;
    const baseY = 940 + arcLift;
    const y = isSelected ? baseY - 35 : baseY;
    const rotation = normalizedOffset * 0.12; // in radians (~7 degrees max)

    return {
      x,
      y,
      rotation,
      scale: 1,
      zIndex: cardIndex,
    };
  },
};
