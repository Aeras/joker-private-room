import { describe, expect, it } from "vitest";
import {
  chooseBiribaBotAction,
  chooseBiribaBotStep,
} from "../../supabase/functions/biriba-commands/bot";
import { beginBiribaMatch, type BiribaMatch } from "./engine";
import type { BiribaCard, BiribaMeld, BiribaRank, BiribaSuit } from "./rules";

const card = (id: string, rank: number, suit: BiribaSuit = "spades"): BiribaCard => ({
  id,
  rank: rank as BiribaRank,
  suit,
});
const meld = (ownerSeat: number, suit: BiribaSuit, first: number, last: number): BiribaMeld => ({
  ownerSeat,
  suit,
  highAce: false,
  cards: Array.from({ length: last - first + 1 }, (_, index) => {
    const rank = first + index;
    return { card: card(`table-${ownerSeat}-${suit}-${rank}`, rank, suit), value: rank };
  }),
});
const setup = (seats: 2 | 4 = 4): BiribaMatch => beginBiribaMatch(seats, () => 0.42);

describe("Biriba bot strategy", () => {
  it("takes a useful discard only when it immediately builds a legal run", () => {
    const game = setup();
    game.hands[0] = [
      card("three", 3),
      card("four", 4),
      card("junk", 11, "clubs"),
      card("junk2", 8, "diamonds"),
    ];
    game.discards = [card("five", 5)];
    const move = chooseBiribaBotAction(game, 0, 3);
    expect(move?.type).toBe("pickup");
    if (move?.type === "pickup")
      expect(move.meld.cards.map((entry) => entry.value)).toEqual([3, 4, 5]);
    expect(chooseBiribaBotStep(game, 0, 3).melds).toHaveLength(1);
  });

  it("draws when the public discard pile cannot be melded", () => {
    const game = setup();
    game.hands[0] = [card("three", 3), card("four", 4), card("junk", 11, "clubs")];
    game.discards = [card("nine", 9, "diamonds")];
    expect(chooseBiribaBotAction(game, 0, 3)).toEqual({ type: "draw" });
  });

  it("recognizes a high Ace run and preserves a clean seven-card biriba", () => {
    const high = setup();
    high.phase = "meld";
    high.hands[0] = [
      card("q", 12),
      card("k", 13),
      card("a", 1),
      card("other", 7, "clubs"),
      card("other2", 9, "diamonds"),
    ];
    const highMove = chooseBiribaBotAction(high, 0, 3);
    expect(highMove?.type).toBe("meld");
    if (highMove?.type === "meld") expect(highMove.meld.highAce).toBe(true);

    const clean = setup();
    clean.phase = "meld";
    clean.trump = "spades";
    clean.hands[0] = [
      ...Array.from({ length: 7 }, (_, index) => card(`run-${index}`, index + 3)),
      { id: "joker", joker: true },
      card("other", 8, "clubs"),
      card("other2", 11, "diamonds"),
    ];
    const cleanMove = chooseBiribaBotAction(clean, 0, 3);
    expect(cleanMove?.type).toBe("meld");
    if (cleanMove?.type === "meld") {
      expect(cleanMove.meld.cards).toHaveLength(7);
      expect(cleanMove.meld.cards.some((entry) => entry.card.joker)).toBe(false);
    }
  });

  it("does not expose a card that directly extends an opponent meld when a safe discard exists", () => {
    const game = setup();
    game.phase = "meld";
    game.trump = "diamonds";
    game.hands[0] = [
      card("enemy-seven", 7),
      card("safe-king", 13, "hearts"),
      card("club-six", 6, "clubs"),
    ];
    game.melds = [meld(1, "spades", 4, 6)];
    expect(chooseBiribaBotAction(game, 0, 3)).toEqual({ type: "discard", id: "safe-king" });
  });

  it("extends the partner's six-card run into a biriba after opening", () => {
    const game = setup();
    game.turn = 2;
    game.phase = "meld";
    game.opened[2] = true;
    game.melds = [meld(0, "hearts", 3, 8)];
    game.hands[2] = [
      card("nine", 9, "hearts"),
      card("junk", 11, "clubs"),
      card("junk2", 4, "diamonds"),
    ];
    const move = chooseBiribaBotAction(game, 2, 3);
    expect(move?.type).toBe("extend");
    if (move?.type === "extend") expect(move.meld.cards).toHaveLength(7);
  });

  it("takes the packet after melding its entire hand into a seven-card run", () => {
    const game = setup(2);
    game.phase = "meld";
    game.hands[0] = Array.from({ length: 7 }, (_, index) => card(`run-${index}`, index + 3));
    const next = chooseBiribaBotStep(game, 0, 3);
    expect(next.packetTaken[0]).toBe(true);
    expect(next.hands[0]).toHaveLength(11);
  });

  it("does not inspect opponent hands or the hidden stock order when selecting an action", () => {
    const game = setup();
    game.phase = "meld";
    game.hands[0] = [
      card("three", 3),
      card("four", 4),
      card("five", 5),
      card("junk", 12, "clubs"),
      card("junk2", 9, "hearts"),
    ];
    const altered = structuredClone(game);
    altered.hands[1] = [{ id: "secret", joker: true }];
    altered.stock.reverse();
    expect(chooseBiribaBotAction(altered, 0, 3)).toEqual(chooseBiribaBotAction(game, 0, 3));
  });

  it.each([2, 4] as const)(
    "can finish seeded %i-player bot-only rounds without illegal or stuck turns",
    (seats) => {
      for (const startingSeed of [193, 777, 1097, 4409, 8101]) {
        let seed = startingSeed;
        const random = () => (seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296;
        let game = beginBiribaMatch(seats, random);
        for (let step = 0; step < 900 && !game.roundEnded; step++) {
          const next = chooseBiribaBotStep(game, game.turn, 3);
          expect(
            next,
            `stuck at seed ${startingSeed}, step ${step} in ${game.phase} for seat ${game.turn}`,
          ).not.toBe(game);
          game = next;
        }
        expect(game.roundEnded).toBe(true);
      }
    },
  );
});
