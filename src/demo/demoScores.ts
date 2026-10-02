/** DEMO ONLY. A partially played score sheet computed with the real scoring function. */
import { DEALS } from "@/domain/gameConfig";
import { scoreDeal } from "@/domain/scoring";
import type { ScoreSheet } from "@/domain/scoreSheet";

const DEMO_RESULTS: [number, number][][] = [
  // [declared, taken] per seat, for the first deals
  [[0, 0], [1, 1], [0, 0], [1, 0]],
  [[1, 1], [0, 1], [2, 2], [0, 0]],
  [[1, 2], [1, 1], [0, 0], [3, 0]],
  [[2, 2], [0, 0], [1, 1], [1, 1]],
  [[5, 5], [0, 0], [0, 0], [1, 0]],
  [[2, 1], [2, 2], [1, 3], [0, 0]],
];

export function createDemoScoreSheet(): ScoreSheet {
  return {
    deals: DEMO_RESULTS.map((row, i) => ({
      dealNumber: DEALS[i]!.dealNumber,
      scores: row.map(([declared, taken]) =>
        scoreDeal({ declared, taken, tricksInDeal: DEALS[i]!.cardsPerPlayer }),
      ),
    })),
    special: [],
  };
}
