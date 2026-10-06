import { getRuleset, type RulesetId } from "./rulesets";
import { RANK_VALUE, SUITS, type Card, type Suit } from "./cards";
import type { SeatIndex } from "./dealing";
import {
  legalMoves,
  type JokerSemantic,
  type PlayerView,
  type PlayedCard,
} from "./engine";
import type {
  CanonicalGameState,
  CanonicalGameTermination,
  CanonicalSeatState,
  ControllerType,
  GameLifecycle,
  SeatOwner,
} from "./gameState";

export type LocalLegalAction =
  | { type: "declare"; values: number[] }
  | { type: "choose_trump"; suits: Array<Suit | null> }
  | { type: "play_card"; cardIds: string[] }
  | { type: "choose_joker_semantic"; options: JokerSemantic[] }
  | { type: "reclaim_control" };

export interface PublicSeatProjection {
  seatIndex: SeatIndex;
  owner: SeatOwner;
  controller: ControllerType;
  connected: boolean;
}

export type PublicInitialDealerSelection =
  | { status: "pending" }
  | {
      status: "resolved";
      openingCard?: Card;
      firstRecipientSeat: SeatIndex;
      revealedSelectionCards: Card[];
      selectedDealerSeat: SeatIndex;
      resolvedAtStateVersion: number;
    };

export interface PlayerGameProjection {
  gameId: string;
  roomId: string;
  rulesetId: RulesetId;
  rulesVersion: string;
  stateSchemaVersion: number;
  stateVersion: number;
  lifecycle: GameLifecycle;
  termination: CanonicalGameTermination | null;
  viewerSeat: SeatIndex;
  progression: CanonicalGameState["progression"];
  initialDealerSelection: PublicInitialDealerSelection | null;
  seats: [PublicSeatProjection, PublicSeatProjection, PublicSeatProjection, PublicSeatProjection];
  trump: CanonicalGameState["trump"];
  declarations: {
    currentDeclarerSeat: SeatIndex | null;
    values: CanonicalGameState["declarations"]["declarations"];
  };
  cards: {
    presentationTail?: CanonicalGameState["cards"]["presentationTail"];
    ownHand: Card[];
    ownHandVisible: boolean;
    exposedTrumpCard: Card | null;
    currentTrick: PlayedCard[];
    completedTricks: CanonicalGameState["cards"]["completedTricks"];
  };
  score: CanonicalGameState["score"] & {
    completedDeals: NonNullable<CanonicalGameState["score"]["completedDeals"]>;
    roundPremia: NonNullable<CanonicalGameState["score"]["roundPremia"]>;
  };
  timing?: { currentHumanDeadline: string | null };
  local: {
    legalActions: LocalLegalAction[];
    reclaimAvailable: boolean;
    humanDeadline: string | null;
  };
}

function publicSeat(seat: CanonicalSeatState): PublicSeatProjection {
  return {
    seatIndex: seat.seatIndex,
    owner: seat.owner,
    controller: seat.controller,
    connected: seat.connected,
  };
}

function publicDealerSelection(state: CanonicalGameState): PublicInitialDealerSelection | null {
  const selection = state.initialDealerSelection;
  if (!selection) return null;
  if (selection.status === "pending") return { status: "pending" };
  return {
    status: "resolved",
    ...(selection.openingCard ? { openingCard: { ...selection.openingCard } } : {}),
    firstRecipientSeat: selection.firstRecipientSeat,
    revealedSelectionCards: selection.revealedSelectionCards.map((card) => ({ ...card })),
    selectedDealerSeat: selection.selectedDealerSeat,
    resolvedAtStateVersion: selection.resolvedAtStateVersion,
  };
}

function visibleOwnHand(state: CanonicalGameState, seat: SeatIndex): { hand: Card[]; visible: boolean } {
  if (state.progression.phase === "INITIAL_DEALER_SELECTION" || state.progression.phase === "DEAL_SETUP") {
    return { hand: [], visible: false };
  }
  const hand = state.cards.hands[seat].slice();
  const pendingJokerId =
    state.progression.phase === "JOKER_DECISION" && state.joker.pendingForSeat === seat
      ? state.joker.cardId
      : null;
  const presentedHand = pendingJokerId ? hand.filter((card) => card.id !== pendingJokerId) : hand;
  if (!state.cards.hiddenPartialNineCardHands) return { hand: presentedHand, visible: true };
  if (state.trump.status === "chooser_pending" && state.trump.chooserSeat === seat) return { hand: presentedHand, visible: true };
  return { hand: [], visible: false };
}

function projectedCurrentTrick(state: CanonicalGameState): PlayedCard[] {
  const current = state.cards.currentTrick.map((play) => ({ ...play, card: { ...play.card } }));
  if (
    state.progression.phase !== "JOKER_DECISION" ||
    state.joker.pendingForSeat == null ||
    !state.joker.cardId ||
    current.some((play) => play.card.id === state.joker.cardId)
  ) return current;

  const pendingCard = state.cards.hands[state.joker.pendingForSeat]
    .find((card) => card.id === state.joker.cardId);
  if (!pendingCard || pendingCard.kind !== "joker") return current;

  // Presentation-only pending play: the canonical card remains in the hand
  // until its semantic choice is committed, but every viewer should see the
  // already-thrown Joker stay on the table while that choice is pending.
  return [...current, { seatIndex: state.joker.pendingForSeat, card: { ...pendingCard } }];
}

function resolvedTrump(state: CanonicalGameState): Suit | null {
  return state.trump.status === "resolved" ? state.trump.suit : null;
}

export function sortHandForDisplay(hand: readonly Card[], trump: Suit | null): Card[] {
  const suitOrder: Suit[] = trump
    ? [trump, ...SUITS.filter((suit) => suit !== trump)]
    : [...SUITS];
  const suitPriority = new Map(suitOrder.map((suit, index) => [suit, index]));

  return hand.slice().sort((a, b) => {
    if (a.kind === "joker" || b.kind === "joker") {
      if (a.kind === "joker" && b.kind === "joker") return a.id.localeCompare(b.id);
      return a.kind === "joker" ? -1 : 1;
    }

    const suitDifference = (suitPriority.get(a.suit) ?? 99) - (suitPriority.get(b.suit) ?? 99);
    if (suitDifference !== 0) return suitDifference;

    const rankDifference = RANK_VALUE[b.rank] - RANK_VALUE[a.rank];
    return rankDifference !== 0 ? rankDifference : a.id.localeCompare(b.id);
  });
}

function playerView(state: CanonicalGameState, seat: SeatIndex, hand: Card[]): PlayerView {
  return {
    deckProfile: getRuleset(state.rulesetId, state.rulesVersion).deckProfile,
    seatIndex: seat,
    hand,
    cardsPerPlayer: state.progression.cardsPerPlayer,
    trump: resolvedTrump(state),
    declarations: Array.from(state.declarations.declarations),
    tricksTaken: Array.from(state.score.tricksTaken),
    currentTrick: state.cards.currentTrick.slice(),
    history: { completedTricks: state.cards.completedTricks.slice() },
  };
}

function jokerOptions(state: CanonicalGameState): JokerSemantic[] {
  if (state.cards.currentTrick.length === 0) {
    return SUITS.flatMap((requestedSuit) => [
      { context: "LEAD", mode: "HIGHER_SUIT", requestedSuit } as const,
      { context: "LEAD", mode: "SUIT_WINS", requestedSuit } as const,
    ]);
  }
  return [
    { context: "OPEN_TRICK", mode: "COMPETE" },
    { context: "OPEN_TRICK", mode: "FROM_BELOW" },
  ];
}

function localLegalActions(state: CanonicalGameState, seat: SeatIndex, visibleHand: Card[]): LocalLegalAction[] {
  if (state.lifecycle !== "active") return [];
  const localSeat = state.seats[seat];

  // A sole human paused on timeout keeps controller="human" and may only
  // reclaim/resume. A temporary-bot takeover is also reclaimable, but the bot
  // must still receive the normal legal gameplay actions for that seat.
  if (localSeat.owner.type === "human" && localSeat.controller === "human" && localSeat.reclaimable) {
    return [{ type: "reclaim_control" }];
  }

  const actions: LocalLegalAction[] = [];
  if (state.progression.phase === "DECLARATION" && state.declarations.currentDeclarerSeat === seat) {
    actions.push({ type: "declare", values: state.declarations.legalValues.slice() });
  }
  if (state.progression.phase === "NINE_CARD_TRUMP_CHOICE" && state.trump.status === "chooser_pending" && state.trump.chooserSeat === seat) {
    actions.push({ type: "choose_trump", suits: [...SUITS, null] });
  }
  if (state.progression.phase === "CARD_PLAY" && state.progression.currentActorSeat === seat && visibleHand.length > 0) {
    actions.push({ type: "play_card", cardIds: legalMoves(playerView(state, seat, visibleHand)).map((card) => card.id) });
  }
  if (state.progression.phase === "JOKER_DECISION" && state.joker.pendingForSeat === seat) {
    actions.push({ type: "choose_joker_semantic", options: jokerOptions(state) });
  }
  if (localSeat.owner.type === "human" && localSeat.reclaimable) {
    actions.push({ type: "reclaim_control" });
  }
  return actions;
}

export function projectGameForSeat(state: CanonicalGameState, seat: SeatIndex, revealRestrictedIdentity = false): PlayerGameProjection {
  if (state.seats[seat]?.seatIndex !== seat) throw new Error("Projection seat does not exist");
  const policy = getRuleset(state.rulesetId, state.rulesVersion);
  const masked = state.rulesetId === "panagiotis" && !revealRestrictedIdentity;
  const own = visibleOwnHand(state, seat);
  const displayedOwnHand = sortHandForDisplay(own.hand, resolvedTrump(state));
  return {
    gameId: state.gameId,
    roomId: state.roomId,
    rulesetId: masked ? "popular" : policy.id,
    rulesVersion: masked ? "popular-v1" : policy.version,
    stateSchemaVersion: state.stateSchemaVersion,
    stateVersion: state.stateVersion,
    lifecycle: state.lifecycle,
    termination: state.termination ? { ...state.termination } : null,
    viewerSeat: seat,
    progression: { ...state.progression },
    initialDealerSelection: publicDealerSelection(state),
    seats: state.seats.map(publicSeat) as PlayerGameProjection["seats"],
    trump: { ...state.trump },
    declarations: {
      currentDeclarerSeat: state.declarations.currentDeclarerSeat,
      values: [...state.declarations.declarations] as CanonicalGameState["declarations"]["declarations"],
    },
    cards: {
      presentationTail: (state.cards.presentationTail ?? []).map((trick) => ({ ...trick, cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } })) })),
      ownHand: displayedOwnHand,
      ownHandVisible: own.visible,
      exposedTrumpCard: state.cards.exposedTrumpCard,
      currentTrick: projectedCurrentTrick(state),
      completedTricks: state.cards.completedTricks.map((trick) => ({
        winnerSeat: trick.winnerSeat,
        cards: trick.cards.map((play) => ({ ...play, card: { ...play.card } })),
      })),
    },
    score: {
      tricksTaken: [...state.score.tricksTaken] as CanonicalGameState["score"]["tricksTaken"],
      currentDealScores: [...state.score.currentDealScores] as CanonicalGameState["score"]["currentDealScores"],
      cumulativeTotals: [...state.score.cumulativeTotals] as CanonicalGameState["score"]["cumulativeTotals"],
      finalPlacements: [...state.score.finalPlacements] as CanonicalGameState["score"]["finalPlacements"],
      completedDeals: (state.score.completedDeals ?? []).map((record) => ({
        ...record,
        declarations: [...record.declarations],
        tricksTaken: [...record.tricksTaken],
        dealScores: [...record.dealScores],
        totalsAfterDeal: [...record.totalsAfterDeal],
      })),
      roundPremia: (state.score.roundPremia ?? []).map((record) => ({
        ...record,
        qualified: [...record.qualified],
        adjustments: [...record.adjustments],
        transfers: record.transfers.map((transfer) => ({ ...transfer })),
        totalsAfterPremia: [...record.totalsAfterPremia],
      })),
    },
    timing: { currentHumanDeadline: state.timing.currentHumanDeadline },
    local: {
      legalActions: localLegalActions(state, seat, own.hand),
      reclaimAvailable: state.lifecycle === "active" && state.seats[seat].owner.type === "human" && state.seats[seat].reclaimable,
      humanDeadline: state.lifecycle === "active" && state.progression.currentActorSeat === seat ? state.timing.currentHumanDeadline : null,
    },
  };
}
