import { biribaMeldValid, type BiribaCard, type BiribaMeld } from "./rules";

/** In the visible ascending meld, «Πίσω» means left/lower and «Μπροστά» means right/higher. */
export type BiribaExtensionOptions = {
  /** Left of the visible run: lower logical card value. */
  behind: BiribaMeld | null;
  /** Right of the visible run: higher logical card value. */
  ahead: BiribaMeld | null;
  /** Natural card or a single legal wildcard endpoint: no follow-up question. */
  automatic: BiribaMeld | null;
};

/**
 * Return the exact validated meld states to send to the authoritative Biriba engine.
 * Do not ask the player for a side when adding a normal/natural card or when
 * only one wildcard endpoint is legal.
 */
export function biribaExtensionOptions(
  meld: BiribaMeld,
  selectedCards: readonly BiribaCard[],
): BiribaExtensionOptions | null {
  if (selectedCards.length !== 1 || !biribaMeldValid(meld)) return null;

  const card = selectedCards[0]!;
  if (meld.cards.some(placement => placement.card.id === card.id)) return null;
  const first = meld.cards[0]!.value;
  const last = meld.cards[meld.cards.length - 1]!.value;

  const extend = (side: "behind" | "ahead", value: number): BiribaMeld | null => {
    if (value < 1 || value > 14) return null;
    const highAce = meld.highAce || value === 14;
    const added = { card, value };
    const candidate: BiribaMeld = {
      ...meld,
      highAce,
      cards: side === "behind" ? [added, ...meld.cards] : [...meld.cards, added],
    };
    return biribaMeldValid(candidate) ? candidate : null;
  };

  // Natural cards, including same-suit twos in their real value-2 position,
  // retain the existing single-click behavior (never offer a wildcard side).
  if (!card.joker && card.suit === meld.suit) {
    const value = card.rank === 1 && last === 13 ? 14 : card.rank;
    const natural = value === first - 1
      ? extend("behind", value)
      : value === last + 1
        ? extend("ahead", value)
        : null;
    if (natural) return { behind: null, ahead: null, automatic: natural };
  }

  if (!card.joker && card.rank !== 2) return null;
  // At most one active wildcard may appear in a Biriba meld.
  const alreadyWild = meld.cards.some(placement =>
    placement.card.joker ||
    (!placement.card.joker && placement.card.rank === 2 &&
      (placement.card.suit !== meld.suit || placement.value !== 2))
  );
  if (alreadyWild) return null;

  const behind = extend("behind", first - 1);
  const ahead = extend("ahead", last + 1);
  if (!behind && !ahead) return null;
  return {
    behind,
    ahead,
    automatic: behind && ahead ? null : behind ?? ahead,
  };
}

/** Existing discard-pickup actions keep their established first-legal-side behavior. */
export function preferredBiribaExtension(
  meld: BiribaMeld,
  selectedCards: readonly BiribaCard[],
): BiribaMeld | null {
  const choices = biribaExtensionOptions(meld, selectedCards);
  return choices?.automatic ?? choices?.behind ?? choices?.ahead ?? null;
}
