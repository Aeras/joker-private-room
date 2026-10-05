import { getRuleset, type RulesetId, type RulesVersion } from "./rulesets";
import { prepareGameplayDeck } from "./deckPolicy";
import { createDeck, shuffleCards } from "./cards";
import { declarationOrder, legalDeclarationValues, type Declarations } from "./declarations";
import { dealWithTrumpReveal, nextSeat, selectInitialDealer, type SeatIndex } from "./dealing";
import { humanDeadlineFromServerTime } from "./controller";
import {
  GAME_STATE_SCHEMA_VERSION,
  type CanonicalGameState,
  type CanonicalSeatState,
  type SeatOwner,
} from "./gameState";

export interface InitialSeatInput {
  seatIndex: SeatIndex;
  owner: SeatOwner;
  connected: boolean;
}

export interface CreateDealerBootstrapStateArgs {
  gameId: string;
  roomId: string;
  rulesetId?: RulesetId;
  rulesVersion?: RulesVersion;
  targetPlayerId?: string;
  bootstrapActionId: string;
  serverEntropySeed: string;
  seats: [InitialSeatInput, InitialSeatInput, InitialSeatInput, InitialSeatInput];
}

export interface ResolveDealerBootstrapArgs {
  state: CanonicalGameState;
  firstRecipientRandom: () => number;
  selectionShuffleRandom: () => number;
  dealOneShuffleRandom: () => number;
  serverNow: string;
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

function emptyHands(): CanonicalGameState["cards"]["hands"] {
  return [[], [], [], []];
}

export function chooseUniformFirstRecipient(random: () => number): SeatIndex {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Random source must return a finite value in [0, 1)");
  }
  return Math.floor(value * 4) as SeatIndex;
}

/** First persisted canonical snapshot after room Start. No gameplay may advance yet. */
export function createInitialDealerBootstrapState(
  args: CreateDealerBootstrapStateArgs,
): CanonicalGameState {
  if (!args.gameId || !args.roomId || !args.bootstrapActionId) {
    throw new Error("Dealer bootstrap identity is incomplete");
  }
  if (!/^[0-9a-f]{64}$/i.test(args.serverEntropySeed)) {
    throw new Error("Dealer bootstrap requires private server entropy");
  }
  if (args.seats.some((seat, index) => seat.seatIndex !== index)) {
    throw new Error("Initial seats must contain canonical indexes 0..3 in order");
  }

  const policy = getRuleset(args.rulesetId ?? "popular", args.rulesVersion ?? "popular-v1");
  const presentTarget = args.seats.some(seat => seat.owner.type === "human" && seat.owner.playerId === args.targetPlayerId);
  return {
    ...(policy.allocation === "reserved_lowest" ? { privateRulesetState: { targetPlayerId: presentTarget ? args.targetPlayerId! : null } } : {}),
    gameId: args.gameId,
    roomId: args.roomId,
    rulesetId: policy.id,
    rulesVersion: policy.version,
    stateSchemaVersion: GAME_STATE_SCHEMA_VERSION,
    stateVersion: 1,
    lifecycle: "starting",
    serverEntropySeed: args.serverEntropySeed.toLowerCase(),
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 1,
      cardsPerPlayer: 1,
      dealerSeat: null,
      firstDeclarerSeat: null,
      firstLeaderSeat: null,
      currentActorSeat: null,
      phase: "INITIAL_DEALER_SELECTION",
    },
    initialDealerSelection: { status: "pending", bootstrapActionId: args.bootstrapActionId },
    seats: args.seats.map(canonicalSeat) as CanonicalGameState["seats"],
    cards: {
      deck: [],
      drawCursor: 0,
      hands: emptyHands(),
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: null,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: [0, 1, 2, 3],
      currentDeclarerSeat: null,
      declarations: [null, null, null, null],
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "unresolved" },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
      completedDeals: [],
      roundPremia: [],
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
  };
}

/**
 * Resolves the dealer ritual and independently shuffles/deals Deal 1, but stops
 * at DEAL_SETUP. The first shuffled selection card is an exposed center card
 * with no recipient; dealer distribution starts from the second card. This is
 * a canonical presentation barrier: no actor, no human deadline, and no
 * automatic controller may advance until every human client has completed the
 * dealer + deal presentation.
 */
export function resolveDealerBootstrapAndInitializeDealOne(
  args: ResolveDealerBootstrapArgs,
): CanonicalGameState {
  const { state } = args;
  const pendingSelection = state.initialDealerSelection;
  if (
    state.lifecycle !== "starting" ||
    state.progression.phase !== "INITIAL_DEALER_SELECTION" ||
    !pendingSelection ||
    pendingSelection.status !== "pending"
  ) {
    throw new Error("Initial dealer bootstrap is not pending");
  }
  if (!state.serverEntropySeed || !/^[0-9a-f]{64}$/i.test(state.serverEntropySeed)) {
    throw new Error("Initial dealer bootstrap is missing private server entropy");
  }

  const firstRecipientSeat = chooseUniformFirstRecipient(args.firstRecipientRandom);
  const selectionDeck = shuffleCards(createDeck(getRuleset(state.rulesetId, state.rulesVersion).deckProfile), args.selectionShuffleRandom);
  const openingCard = selectionDeck[0];
  if (!openingCard) throw new Error("Dealer-selection deck is empty");
  const distributedDeck = selectionDeck.slice(1);
  const selection = selectInitialDealer(distributedDeck, firstRecipientSeat);
  const revealedSelectionCards = distributedDeck.slice(0, selection.revealedCount);
  const lastRevealed = revealedSelectionCards.at(-1);
  if (!lastRevealed || lastRevealed.kind !== "standard" || lastRevealed.rank !== "A") {
    throw new Error("Dealer bootstrap did not end on an Ace");
  }
  if (revealedSelectionCards.slice(0, -1).some((card) => card.kind === "standard" && card.rank === "A")) {
    throw new Error("Dealer bootstrap prefix contains an earlier distributed Ace");
  }

  const dealerSeat = selection.dealerSeat;
  const firstDeclarerSeat = nextSeat(dealerSeat);
  const gameplayDeck = prepareGameplayDeck(state, dealerSeat, 1, args.dealOneShuffleRandom);
  const firstDeal = dealWithTrumpReveal(gameplayDeck, dealerSeat, 1);
  const declarations: Declarations = [null, null, null, null];
  const nextStateVersion = state.stateVersion + 1;

  return {
    ...state,
    stateVersion: nextStateVersion,
    lifecycle: "starting",
    progression: {
      round: 1,
      dealNumber: 1,
      indexInPhase: 1,
      cardsPerPlayer: 1,
      dealerSeat,
      firstDeclarerSeat,
      firstLeaderSeat: firstDeclarerSeat,
      currentActorSeat: null,
      phase: "DEAL_SETUP",
    },
    initialDealerSelection: {
      status: "resolved",
      bootstrapActionId: pendingSelection.bootstrapActionId,
      openingCard,
      firstRecipientSeat,
      revealedSelectionCards,
      selectedDealerSeat: dealerSeat,
      resolvedAtStateVersion: nextStateVersion,
    },
    cards: {
      deck: gameplayDeck,
      drawCursor: firstDeal.cursor,
      hands: firstDeal.hands,
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: firstDeal.revealedTrumpCard,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: {
      order: declarationOrder(dealerSeat) as [SeatIndex, SeatIndex, SeatIndex, SeatIndex],
      currentDeclarerSeat: null,
      declarations,
      legalValues: [],
      forbiddenDealerValue: null,
    },
    trump: { status: "resolved", suit: firstDeal.trump },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
      cumulativeTotals: [0, 0, 0, 0],
      finalPlacements: [null, null, null, null],
      completedDeals: state.score.completedDeals ?? [],
      roundPremia: state.score.roundPremia ?? [],
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
  };
}

/** Release the canonical startup barrier only after every human client finished presentation. */
export function activateDealOneAfterPresentation(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (
    state.lifecycle !== "starting" ||
    state.progression.phase !== "DEAL_SETUP" ||
    state.progression.dealerSeat == null ||
    state.progression.firstDeclarerSeat == null ||
    state.progression.firstLeaderSeat == null ||
    state.initialDealerSelection?.status !== "resolved"
  ) {
    throw new Error("Deal 1 presentation barrier is not ready");
  }

  const actor = state.progression.firstDeclarerSeat;
  const declarations: Declarations = [null, null, null, null];
  const actorController = state.seats[actor].controller;

  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    lifecycle: "active",
    progression: {
      ...state.progression,
      phase: "DECLARATION",
      currentActorSeat: actor,
    },
    declarations: {
      ...state.declarations,
      currentDeclarerSeat: actor,
      declarations,
      legalValues: legalDeclarationValues({
        cardsPerPlayer: state.progression.cardsPerPlayer,
        dealerSeat: state.progression.dealerSeat,
        seatIndex: actor,
        declarations,
      }),
      forbiddenDealerValue: null,
    },
    timing: {
      currentHumanDeadline:
        actorController === "human" ? humanDeadlineFromServerTime(serverNow) : null,
      timeoutTakeoverActive: false,
    },
  };
}
