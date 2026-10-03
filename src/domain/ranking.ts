export interface RankedSeat {
  seatIndex: number;
  score: number;
  placement: number;
}

/** Competition ranking: equal totals share place and later numbers skip (1,1,3,4). */
export function rankFinalScores(scores: readonly number[]): RankedSeat[] {
  const sorted = scores
    .map((score, seatIndex) => ({ seatIndex, score }))
    .sort((a, b) => b.score - a.score || a.seatIndex - b.seatIndex);

  let previousScore: number | null = null;
  let previousPlacement = 0;
  return sorted.map((entry, index) => {
    const placement = previousScore === entry.score ? previousPlacement : index + 1;
    previousScore = entry.score;
    previousPlacement = placement;
    return { ...entry, placement };
  });
}
