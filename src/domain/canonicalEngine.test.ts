import { describe, expect, it } from "vitest";
import {
  createDeck,
  DECK_SIZE,
  RANKS,
  RANK_VALUE,
  shuffleCards,
  type Card,
  type StandardCard,
} from "./cards";
import {
  applyDeclaration,
  declarationOrder,
  legalDeclarationValues,
  type Declarations,
} from "./declarations";
import {
  completeNineCardDeal,
  dealNineCardInitial,
  dealWithTrumpReveal,
  nextSeat,
  selectInitialDealer,
  type SeatIndex,
} from "./dealing";
import { legalCards, resolveTrick, type PlayedCard } from "./engine";
import { DEALS, GAME_PHASES, TOTAL_DEALS } from "./gameConfig";
import { resolvePremia, type RoundDealOutcome } from "./premia";
import { rankFinalScores } from "./ranking";
import { scoreDeal } from "./scoring";

function standard(id: string, suit: StandardCard["suit"], rank: StandardCard["rank"]): StandardCard {
  return { kind: "standard", id, suit, rank };
}

const joker1: Card = { kind: "joker", id: "joker-1" };
const joker2: Card = { kind: "joker", id: "joker-2" };

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ids(cards: readonly Card[]): string[] {
  return cards.map((card) => card.id);
}

function play(seatIndex: number, card: Card, joker?: PlayedCard["joker"]): PlayedCard {
  return joker ? { seatIndex, card, joker } : { seatIndex, card };
}

function round2Outcome(
  indexInPhase: number,
  declarations: [number, number, number, number],
  tricksTaken: [number, number, number, number],
): RoundDealOutcome {
  return { indexInPhase, cardsPerPlayer: 9, declarations, tricksTaken };
}

describe("canonical deck and schedule", () => {
  it("contains exactly 36 unique cards, 34 normal, two Jokers and only red sixes", () => {
    const deck = createDeck();
    const sixSuits = deck.flatMap((card) =>
      card.kind === "standard" && card.rank === "6" ? [card.suit] : [],
    );
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(ids(deck)).size).toBe(DECK_SIZE);
    expect(deck.filter((card) => card.kind === "standard")).toHaveLength(34);
    expect(deck.filter((card) => card.kind === "joker")).toHaveLength(2);
    expect(deck.some((card) => card.id === "6-spades" || card.id === "6-clubs")).toBe(false);
    expect(sixSuits.sort()).toEqual(["diamonds", "hearts"]);
  });

  it("preserves canonical rank order", () => {
    expect(RANKS).toEqual(["6", "7", "8", "9", "10", "J", "Q", "K", "A"]);
    expect(RANKS.map((rank) => RANK_VALUE[rank])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("contains the exact four-round / 24-deal schedule", () => {
    expect(GAME_PHASES.map((phase) => phase.deals)).toEqual([
      [1, 2, 3, 4, 5, 6, 7, 8],
      [9, 9, 9, 9],
      [8, 7, 6, 5, 4, 3, 2, 1],
      [9, 9, 9, 9],
    ]);
    expect(TOTAL_DEALS).toBe(24);
    expect(DEALS.map((deal) => deal.dealNumber)).toEqual(
      Array.from({ length: 24 }, (_, index) => index + 1),
    );
  });

  it("supports deterministic injected shuffle without changing deck identity", () => {
    const a = shuffleCards(createDeck(), seededRandom(42));
    const b = shuffleCards(createDeck(), seededRandom(42));
    expect(ids(a)).toEqual(ids(b));
    expect(new Set(ids(a))).toEqual(new Set(ids(createDeck())));
  });
});

describe("dealer and canonical dealing", () => {
  it("selects the receiver of first Ace without consuming the game deck", () => {
    const selected = selectInitialDealer(
      [
        standard("7-hearts", "hearts", "7"),
        standard("8-clubs", "clubs", "8"),
        standard("A-diamonds", "diamonds", "A"),
        standard("A-spades", "spades", "A"),
      ],
      1,
    );
    expect(selected).toMatchObject({ dealerSeat: 3, revealedCount: 3 });
    expect(selected.firstAceCard.id).toBe("A-diamonds");
    expect(createDeck()).toHaveLength(36);
  });

  it("rotates dealer cyclically", () => {
    expect([0, 1, 2, 3].map((seat) => nextSeat(seat))).toEqual([1, 2, 3, 0]);
  });

  it("deals immediately after dealer then reveals next card for 1..8 deals", () => {
    const deck = createDeck();
    const result = dealWithTrumpReveal(deck, 0, 2);
    expect(ids(result.hands[1])).toEqual([deck[0]!.id, deck[4]!.id]);
    expect(ids(result.hands[2])).toEqual([deck[1]!.id, deck[5]!.id]);
    expect(ids(result.hands[3])).toEqual([deck[2]!.id, deck[6]!.id]);
    expect(ids(result.hands[0])).toEqual([deck[3]!.id, deck[7]!.id]);
    expect(result.revealedTrumpCard.id).toBe(deck[8]!.id);
  });

  it("deals 12 cards before 9-card trump choice and continues from same cursor to 36", () => {
    const deck = shuffleCards(createDeck(), seededRandom(7));
    const initial = dealNineCardInitial(deck, 2);
    expect(initial.cursor).toBe(12);
    expect(initial.hands.map((hand) => hand.length)).toEqual([3, 3, 3, 3]);
    expect(new Set(initial.hands.flatMap(ids)).size).toBe(12);

    const completed = completeNineCardDeal(deck, 2, initial);
    expect(completed.cursor).toBe(36);
    expect(completed.hands.map((hand) => hand.length)).toEqual([9, 9, 9, 9]);
    expect(new Set(completed.hands.flatMap(ids))).toEqual(new Set(ids(deck)));
  });

  it("executes canonical deal shapes across all 24 deals", () => {
    let dealer: SeatIndex = 0;
    for (const deal of DEALS) {
      const deck = shuffleCards(createDeck(), seededRandom(1000 + deal.dealNumber));
      if (deal.cardsPerPlayer === 9) {
        const completed = completeNineCardDeal(deck, dealer, dealNineCardInitial(deck, dealer));
        expect(completed.hands.every((hand) => hand.length === 9)).toBe(true);
      } else {
        const result = dealWithTrumpReveal(deck, dealer, deal.cardsPerPlayer);
        expect(result.hands.every((hand) => hand.length === deal.cardsPerPlayer)).toBe(true);
      }
      dealer = nextSeat(dealer);
    }
    expect(dealer).toBe(0);
  });
});

describe("declarations", () => {
  it("starts after dealer and leaves dealer last", () => {
    expect(declarationOrder(2)).toEqual([3, 0, 1, 2]);
  });

  it("allows 0..cards then removes the forbidden final dealer declaration", () => {
    let declarations: Declarations = [null, null, null, null];
    expect(
      legalDeclarationValues({ cardsPerPlayer: 2, dealerSeat: 0, seatIndex: 1, declarations }),
    ).toEqual([0, 1, 2]);
    declarations = applyDeclaration({ cardsPerPlayer: 2, dealerSeat: 0, seatIndex: 1, declarations, declared: 1 });
    declarations = applyDeclaration({ cardsPerPlayer: 2, dealerSeat: 0, seatIndex: 2, declarations, declared: 0 });
    declarations = applyDeclaration({ cardsPerPlayer: 2, dealerSeat: 0, seatIndex: 3, declarations, declared: 1 });
    expect(
      legalDeclarationValues({ cardsPerPlayer: 2, dealerSeat: 0, seatIndex: 0, declarations }),
    ).toEqual([1, 2]);
  });

  it("rejects stale or out-of-order declaration attempts", () => {
    const declarations: Declarations = [null, null, null, null];
    expect(
      legalDeclarationValues({ cardsPerPlayer: 5, dealerSeat: 0, seatIndex: 2, declarations }),
    ).toEqual([]);
    expect(() =>
      applyDeclaration({ cardsPerPlayer: 5, dealerSeat: 0, seatIndex: 2, declarations, declared: 1 }),
    ).toThrow("Illegal declaration");
  });
});

describe("legal play", () => {
  const diamond7 = standard("7-diamonds", "diamonds", "7");
  const heartA = standard("A-hearts", "hearts", "A");
  const clubA = standard("A-clubs", "clubs", "A");

  it("requires requested suit while Joker remains a strategic legal choice", () => {
    expect(ids(legalCards({ hand: [diamond7, heartA, joker1], requestedSuit: "diamonds", trump: "hearts" }))).toEqual([
      diamond7.id,
      joker1.id,
    ]);
  });

  it("requires trump when void while Joker remains a strategic legal choice", () => {
    expect(ids(legalCards({ hand: [heartA, clubA, joker1], requestedSuit: "diamonds", trump: "hearts" }))).toEqual([
      heartA.id,
      joker1.id,
    ]);
  });

  it("allows discard when void and no trump is available", () => {
    expect(ids(legalCards({ hand: [clubA, joker1], requestedSuit: "diamonds", trump: null }))).toEqual([
      clubA.id,
      joker1.id,
    ]);
  });
});

describe("trick resolution", () => {
  it("uses highest requested suit without trump", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, standard("7-d", "diamonds", "7")),
        play(1, standard("A-c", "clubs", "A")),
        play(2, standard("K-d", "diamonds", "K")),
        play(3, standard("8-d", "diamonds", "8")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 2, reason: "NORMAL_LED_SUIT" });
  });

  it("uses highest trump", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, standard("A-d", "diamonds", "A")),
        play(1, standard("7-h", "hearts", "7")),
        play(2, standard("K-h", "hearts", "K")),
        play(3, standard("Q-d", "diamonds", "Q")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 2, reason: "NORMAL_TRUMP" });
  });

  it("lets competing Joker beat normal/trump and second competing Joker beat first", () => {
    const first = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, standard("A-d", "diamonds", "A")),
        play(1, joker1, { context: "OPEN_TRICK", mode: "COMPETE" }),
        play(2, standard("A-h", "hearts", "A")),
        play(3, standard("K-d", "diamonds", "K")),
      ],
    });
    expect(first.winnerSeat).toBe(1);

    const second = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, standard("A-d", "diamonds", "A")),
        play(1, joker1, { context: "OPEN_TRICK", mode: "COMPETE" }),
        play(2, standard("A-h", "hearts", "A")),
        play(3, joker2, { context: "OPEN_TRICK", mode: "COMPETE" }),
      ],
    });
    expect(second).toMatchObject({ winnerSeat: 3, reason: "COMPETING_JOKER" });
  });

  it("ignores from-below Joker", () => {
    const result = resolveTrick({
      trump: null,
      plays: [
        play(0, standard("7-d", "diamonds", "7")),
        play(1, joker1, { context: "OPEN_TRICK", mode: "FROM_BELOW" }),
        play(2, standard("A-d", "diamonds", "A")),
        play(3, standard("K-d", "diamonds", "K")),
      ],
    });
    expect(result.winnerSeat).toBe(2);
  });

  it("resolves SUIT_WINS through requested suit plus normal trump", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, joker1, { context: "LEAD", mode: "SUIT_WINS", requestedSuit: "diamonds" }),
        play(1, standard("A-d", "diamonds", "A")),
        play(2, standard("7-h", "hearts", "7")),
        play(3, standard("K-d", "diamonds", "K")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 2, reason: "JOKER_SUIT_WINS" });
  });

  it("lets mandatory trump beat HIGHER_SUIT leading Joker on non-trump request", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, joker1, { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" }),
        play(1, standard("7-h", "hearts", "7")),
        play(2, standard("A-d", "diamonds", "A")),
        play(3, standard("K-h", "hearts", "K")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 3, reason: "JOKER_HIGHER_SUIT_TRUMPED" });
  });

  it("keeps HIGHER_SUIT leading Joker when no trump appears", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, joker1, { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "diamonds" }),
        play(1, standard("7-d", "diamonds", "7")),
        play(2, standard("A-d", "diamonds", "A")),
        play(3, standard("K-d", "diamonds", "K")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 0, reason: "JOKER_HIGHER_SUIT" });
  });

  it("keeps HIGHER_SUIT leading Joker above normal trump when requested suit is trump", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, joker1, { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "hearts" }),
        play(1, standard("A-h", "hearts", "A")),
        play(2, standard("K-h", "hearts", "K")),
        play(3, standard("Q-h", "hearts", "Q")),
      ],
    });
    expect(result.winnerSeat).toBe(0);
  });

  it("allows only second competing Joker to beat HIGHER_SUIT leading Joker", () => {
    const result = resolveTrick({
      trump: "hearts",
      plays: [
        play(0, joker1, { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit: "hearts" }),
        play(1, standard("A-h", "hearts", "A")),
        play(2, joker2, { context: "OPEN_TRICK", mode: "COMPETE" }),
        play(3, standard("K-h", "hearts", "K")),
      ],
    });
    expect(result).toMatchObject({ winnerSeat: 2, reason: "COMPETING_JOKER" });
  });
});

describe("scoring, premia and ranking", () => {
  it("implements all canonical base score formulas", () => {
    expect(scoreDeal({ declared: 0, taken: 0, tricksInDeal: 5 })).toBe(50);
    expect(scoreDeal({ declared: 3, taken: 3, tricksInDeal: 5 })).toBe(200);
    expect(scoreDeal({ declared: 5, taken: 5, tricksInDeal: 5 })).toBe(500);
    expect(scoreDeal({ declared: 3, taken: 2, tricksInDeal: 5 })).toBe(20);
    expect(scoreDeal({ declared: 3, taken: 0, tricksInDeal: 5 })).toBe(-200);
  });

  it("resolves opposite premia and earliest tied eligible target score", () => {
    const result = resolvePremia(2, [
      round2Outcome(1, [3, 2, 2, 1], [3, 2, 2, 2]),
      round2Outcome(2, [3, 1, 2, 2], [3, 2, 2, 2]),
      round2Outcome(3, [3, 2, 2, 1], [3, 2, 2, 2]),
      round2Outcome(4, [3, 1, 2, 1], [3, 2, 2, 2]),
    ]);
    expect(result.qualified).toEqual([true, false, true, false]);
    expect(result.adjustments).toEqual([200, -150, 150, -150]);
    expect(result.transfers).toEqual([
      { bonusSeat: 0, bonusDealIndex: 1, bonusAmount: 200, targetSeat: 1, removedDealIndex: 1, removedAmount: 150 },
      { bonusSeat: 2, bonusDealIndex: 1, bonusAmount: 150, targetSeat: 3, removedDealIndex: 2, removedAmount: 150 },
    ]);
  });

  it("passes bonus eligibility through a consecutive premia chain", () => {
    const result = resolvePremia(2, [
      round2Outcome(1, [0, 2, 4, 2], [0, 2, 4, 3]),
      round2Outcome(2, [0, 2, 3, 3], [0, 2, 4, 3]),
      round2Outcome(3, [0, 2, 3, 2], [0, 2, 4, 3]),
      round2Outcome(4, [0, 2, 3, 2], [0, 2, 4, 3]),
    ]);
    expect(result.qualified).toEqual([true, true, false, false]);
    expect(result.adjustments).toEqual([0, 150, -250, 0]);
    expect(result.transfers[0]).toMatchObject({ bonusSeat: 1, targetSeat: 2, bonusAmount: 150, removedAmount: 250 });
  });

  it("does not transfer removal when target lacks eligible >=150 score", () => {
    const result = resolvePremia(2, [
      round2Outcome(1, [3, 1, 2, 1], [3, 2, 2, 2]),
      round2Outcome(2, [3, 1, 2, 1], [3, 2, 2, 2]),
      round2Outcome(3, [3, 1, 2, 1], [3, 2, 2, 2]),
      round2Outcome(4, [3, 1, 2, 1], [3, 2, 2, 2]),
    ]);
    expect(result.qualified).toEqual([true, false, true, false]);
    expect(result.adjustments).toEqual([200, 0, 150, 0]);
    expect(result.transfers.every((transfer) => transfer.removedAmount === 0)).toBe(true);
  });

  it("uses competition ranking with shared positions and skipped numbers", () => {
    expect(rankFinalScores([500, 500, 250, 100])).toEqual([
      { seatIndex: 0, score: 500, placement: 1 },
      { seatIndex: 1, score: 500, placement: 1 },
      { seatIndex: 2, score: 250, placement: 3 },
      { seatIndex: 3, score: 100, placement: 4 },
    ]);
  });
});
