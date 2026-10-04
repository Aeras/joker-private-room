import { createDeck, shuffleCards } from "./cards";
import { declarationOrder, legalDeclarationValues, type Declarations } from "./declarations";
import {
  dealWithTrumpReveal,
  nextSeat,
  selectInitialDealer,
  type SeatIndex,
} from "./dealing";
import { humanDeadlineFromServerTime } from "./controller";
import {
  GAME_STATE_SCHEMA_VERSION,
  POPULAR_RULES_VERSION,
  type CanonicalGameState,
  type CanonicalSeatState,
  type SeatOwner,
} from "./gameState";

export interface InitialSeatInput {
  seatIndex: SeatIndex;
  owner: SeatOwner;
  connected: boolean;
}

export interface InitializeCanonicalGameArgs {
  gameId: string;
  roomId: string;
  seats: [InitialSeatInput, InitialSeatInput, InitialSeatInput, InitialSeatInput];
  random: () => number;
  serverNow: string;
  /** Stable setup convention; does not affect fairness because dealer selection deck is shuffled. */
  firstDealerRecipientSeat?: SeatIndex;
}

function canonicalSeat(input: InitialSeatInput): CanonicalSeatState {
  return {
    seatIndex: input.seatIndex,
    owner: input.owner,
    controller: input.owner.type === "human" ? "human" : "permanent_bot",
    connected: input.owner.type === "human" ? input.connected : false,
    takeoverAt: null,
    reclaimable: false,
  };
}

/**
 * Builds the first persisted canonical snapshot from a trusted Start roster.
 * Dealer selection uses a separate shuffled 36-card deck. The real first deal
 * uses a fresh complete 36-card deck as required by the canonical rules.
 */
export function initializeCanonicalGameState(args: InitializeCanonicalGameArgs): CanonicalGameState {
  if (!args.gameId || !args.roomId) throw new Error("Game and room IDs are required");
  if (args.seats.some((seat, index) => seat.seatIndex !== index)) {
    throw new Error("Initial seats must contain canonical seat indexes 0..3 in order");
  }

  const selectionDeck = shuffleCards(createDeck(), args.random);
  const dealerSelection = selectInitialDealer(
    selectionDeck,
    args.firstDealerRecipientSeat ?? 0,
  );

  const actualDeck = shuffleCards(createDeck(), args.random);
  const firstDeal = dealWithTrumpReveal(actualDeck, dealerSelection.dealerSeat, 1);
  const firstDeclarer = nextSeat(dealerSelection.dealerSeat);
  const declarations: Declarations = [null, null, null, null];
  const seats = args.seats.map(canonicalSeat) as CanonicalGameState["seats"];
  const legalValues = legalDeclarationValues({
    cardsPerPlayer: 1,
    dealerSeat: dealerSelection.dealerSeat,
    seatIndex: firstDeclarer,
    declarations,
  });

  return {
    gameId: args.gameId,
    roomId: args.roomId,
    rulesetId: "popular",
    rulesVersion: POPULAR_RULES_VERSION,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 1,
    lifecycle: "active",
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 1,
      cardsPerPlayer: 1,
      dealerSeat: dealerSelection.dealerSeat,
      firstDeclarerSeat: firstDeclarer,
      firstLeaderSeat: firstDeclarer,
      currentActorSeat: firstDeclarer,
      phase: "DECLARATION",
    },
    seats,
    cards: {
      deck: actualDeck,
      drawCursor: firstDeal.cursor,
      hands: firstDeal.hands,
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: firstDeal.revealedTrumpCard,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: declarationOrder(dealerSelection.dealerSeat) as [SeatIndex, SeatIndex, SeatIndex, SeatIndex],
      currentDeclarerSeat: firstDeclarer,
      declarations,
      legalValues,
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: firstDeal.trump },
    joker: {
      pendingForSeat: null,
      cardId: null,
      semantic: null,
    },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
    },
    timing: {
      currentHumanDeadline:
        seats[firstDeclarer].controller === "human"
          ? humanDeadlineFromServerTime(args.serverNow)
          : null,
      timeoutTakeoverActive: false,
    },
  };
}
