import { describe, expect, it } from "vitest";
import { biribaAction, beginBiribaMatch } from "../../supabase/functions/biriba-commands/engine";
import { biribaExtensionOptions, preferredBiribaExtension } from "./extensionOptions";
import { biribaMeldValid, type BiribaCard, type BiribaMeld, type BiribaRank, type BiribaSuit } from "./rules";

const card = (id: string, rank: number, suit: BiribaSuit = "hearts"): BiribaCard => ({
  id, rank: rank as BiribaRank, suit,
});
const joker: BiribaCard = { id: "chosen-joker", joker: true };
const two = card("chosen-two", 2, "clubs");
const run = (values: number[], ownerSeat = 0): BiribaMeld => ({
  ownerSeat, suit: "hearts", highAce: values.includes(14),
  cards: values.map(value => ({
    card: card(`held-${value}`, value === 14 ? 1 : value), value,
  })),
});

describe("Biriba wild-card extension sides", () => {
  for (const wild of [joker, two, card("natural-suit-wild-two", 2)]) {
    it(`offers left/Πίσω and right/Μπροστά for ${wild.joker ? "Joker" : wild.id}`, () => {
      const meld = run([7, 8, 9]);
      const options = biribaExtensionOptions(meld, [wild]);
      expect(options?.automatic).toBeNull();
      expect(options?.behind?.cards.map(p => p.value)).toEqual([6, 7, 8, 9]);
      expect(options?.ahead?.cards.map(p => p.value)).toEqual([7, 8, 9, 10]);
      expect(options?.behind?.cards[0]?.card.id).toBe(wild.id);
      expect(options?.ahead?.cards.at(-1)?.card.id).toBe(wild.id);
      expect(options?.behind && biribaMeldValid(options.behind)).toBe(true);
      expect(options?.ahead && biribaMeldValid(options.ahead)).toBe(true);
    });
  }

  it("does not ask for sides when a same-suit two is natural", () => {
    const naturalTwo = card("natural-two", 2, "hearts");
    const options = biribaExtensionOptions(run([3, 4, 5]), [naturalTwo]);
    expect(options?.automatic?.cards.map(p => p.value)).toEqual([2, 3, 4, 5]);
    expect(options?.behind).toBeNull();
    expect(options?.ahead).toBeNull();
  });

  it("plays normal cards on their only legal endpoint without a follow-up", () => {
    const left = biribaExtensionOptions(run([7, 8, 9]), [card("six", 6)]);
    const right = biribaExtensionOptions(run([7, 8, 9]), [card("ten", 10)]);
    expect(left?.automatic?.cards[0]?.value).toBe(6);
    expect(right?.automatic?.cards.at(-1)?.value).toBe(10);
    expect(left?.ahead).toBeNull();
    expect(right?.behind).toBeNull();
  });

  it("auto-selects the only legal wildcard endpoint at each run boundary", () => {
    const low = biribaExtensionOptions(run([1, 2, 3]), [joker]);
    const high = biribaExtensionOptions(run([11, 12, 13, 14]), [joker]);
    expect(low?.automatic?.cards.map(p => p.value)).toEqual([1, 2, 3, 4]);
    expect(low?.behind).toBeNull();
    expect(high?.automatic?.cards.map(p => p.value)).toEqual([10, 11, 12, 13, 14]);
    expect(high?.ahead).toBeNull();
  });

  it("allows natural two next to an existing wildcard but not a second active wildcard", () => {
    const meld: BiribaMeld = { ownerSeat: 0, suit: "hearts", highAce: false, cards: [
      { card: card("three", 3), value: 3 },
      { card: { id: "existing-joker", joker: true }, value: 4 },
      { card: card("five", 5), value: 5 },
    ] };
    expect(biribaExtensionOptions(meld, [card("two-natural", 2)])?.automatic?.cards[0]?.value).toBe(2);
    expect(biribaExtensionOptions(meld, [two])).toBeNull();
    expect(biribaExtensionOptions(meld, [joker])).toBeNull();
  });

  it("does not create a second wildcard, duplicate card, or multi-card extension", () => {
    const meld = run([7, 8, 9]);
    expect(biribaExtensionOptions(meld, [joker, two])).toBeNull();
    expect(biribaExtensionOptions(meld, [{ ...meld.cards[0]!.card }])).toBeNull();
    expect(biribaExtensionOptions(meld, [])).toBeNull();
  });

  it("keeps the established first-legal-endpoint discard pickup behavior", () => {
    expect(preferredBiribaExtension(run([7, 8, 9]), [joker])?.cards[0]?.value).toBe(6);
    expect(preferredBiribaExtension(run([1, 2, 3]), [joker])?.cards.at(-1)?.value).toBe(4);
  });

  for (const wild of [joker, two]) {
    it(`both ${wild.joker ? "Joker" : "two"} choices are accepted by the authoritative server engine`, () => {
      const existing = run([7, 8, 9]);
      const options = biribaExtensionOptions(existing, [wild])!;
      for (const [placement, value] of [["behind", 6], ["ahead", 10]] as const) {
        const match = beginBiribaMatch(2, () => 0.12);
        match.phase = "meld";
        match.hands[0] = [wild, card("spare-card", 4, "spades")];
        match.melds = [existing];
        const candidate = options[placement]!;
        const next = biribaAction(match, 0, { type: "extend", index: 0, meld: candidate });
        expect(next.melds[0]!.cards.find(c => c.card.id === wild.id)?.value).toBe(value);
        expect(next.hands[0]!.some(c => c.id === wild.id)).toBe(false);
        expect(next.melds[0]!.cards.map(c => c.card.id).filter(id => id === wild.id)).toHaveLength(1);
      }
    });
  }
});
