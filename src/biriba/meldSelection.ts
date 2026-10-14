import { biribaMeldValid, type BiribaCard, type BiribaMeld, type BiribaSuit } from "./rules";

/** Build a legal sequence from cards selected in any order, including one wildcard. */
export function selectedBiribaMeld(cards: BiribaCard[], seat: number): BiribaMeld | null {
  if (cards.length < 3 || cards.length > 13 || new Set(cards.map(c => c.id)).size !== cards.length) return null;
  const suits = [...new Set(cards.filter((c): c is Extract<BiribaCard, { joker?: false }> => !c.joker && c.rank !== 2).map(c => c.suit))];
  // With only twos/jokers, no unambiguous suit to lay down.
  if (suits.length !== 1) return null;
  const suit = suits[0] as BiribaSuit;
  for (const highAce of [false, true]) {
    for (let start = highAce ? 3 : 1; start + cards.length - 1 <= (highAce ? 14 : 13); start++) {
      if (highAce && start + cards.length - 1 !== 14) continue;
      const used = new Set<string>();
      const placements: BiribaMeld["cards"] = [];
      const missing: number[] = [];
      for (let value = start; value < start + cards.length; value++) {
        const natural = cards.find(card => !used.has(card.id) && !card.joker &&
          card.suit === suit && (card.rank === value || (card.rank === 1 && highAce && value === 14)));
        if (natural) {
          used.add(natural.id);
          placements.push({ card: natural, value });
        } else missing.push(value);
      }
      if (missing.length > 1) continue;
      if (missing.length === 1) {
        const wildcard = cards.find(card => !used.has(card.id) &&
          (card.joker || (card.rank === 2 && !(card.suit === suit && missing[0] === 2))));
        if (!wildcard) continue;
        used.add(wildcard.id);
        placements.push({ card: wildcard, value: missing[0]! });
      }
      if (used.size !== cards.length) continue;
      placements.sort((a, b) => a.value - b.value);
      const meld: BiribaMeld = { ownerSeat: seat, suit, highAce, cards: placements };
      if (biribaMeldValid(meld)) return meld;
    }
  }
  return null;
}
