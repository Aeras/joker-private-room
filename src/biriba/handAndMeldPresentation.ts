import { BIRIBA_SUITS, biribaTeamOf, type BiribaCard, type BiribaMeld, type BiribaSeatCount } from "./rules";

/** Presentation-only order: ♠, ♥, ♦, ♣, then Jokers. Ace is high within its suit. */
export function sortedBiribaHand(cards: readonly BiribaCard[]): BiribaCard[] {
  return [...cards].sort((a, b) => {
    if (a.joker) return b.joker ? 0 : 1;
    if (b.joker) return -1;
    const suitDifference = BIRIBA_SUITS.indexOf(a.suit) - BIRIBA_SUITS.indexOf(b.suit);
    if (suitDifference) return suitDifference;
    return (a.rank === 1 ? 14 : a.rank) - (b.rank === 1 ? 14 : b.rank);
  });
}

/** Display numbers are 1-based per team; action targets retain global server indexes. */
export function biribaMeldDisplayLayout(melds: readonly BiribaMeld[], seats: BiribaSeatCount) {
  const byTeam: [number[], number[]] = [[], []];
  const numberByGlobalIndex = new Map<number, number>();
  melds.forEach((meld, globalIndex) => {
    const teamIndex = biribaTeamOf(meld.ownerSeat, seats);
    const teamMelds = byTeam[teamIndex]!;
    teamMelds.push(globalIndex);
    numberByGlobalIndex.set(globalIndex, teamMelds.length);
  });
  return { byTeam, numberByGlobalIndex };
}
