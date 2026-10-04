import { getRuleset } from "./rulesets";
import { SUITS, type Card, type Suit } from "./cards";
import {
  applyDeclaration,
  declarationsAreComplete,
  legalDeclarationValues,
  nextDeclarer,
} from "./declarations";
import { completeNineCardDeal, nextSeat, type SeatIndex } from "./dealing";
import {
  legalMoves,
  resolveTrick,
  type JokerSemantic,
  type PlayedCard,
  type PlayerView,
} from "./engine";
import { humanDeadlineFromServerTime } from "./controller";
import type { CanonicalGameState, ControllerType } from "./gameState";

export type GameplayCommand =
  | { type: "declare"; value: number }
  | { type: "choose_trump"; suit: Suit | null }
  | { type: "play_card"; cardId: string }
  | { type: "choose_joker_semantic"; semantic: JokerSemantic };

export type GameplayCommandFailureCode =
  | "NOT_CURRENT_ACTOR"
  | "WRONG_PHASE"
  | "INVALID_DECLARATION"
  | "FORBIDDEN_DEALER_DECLARATION"
  | "INVALID_TRUMP_CHOICE"
  | "ILLEGAL_CARD"
  | "JOKER_CHOICE_REQUIRED"
  | "INVALID_JOKER_CHOICE"
  | "CONTROLLER_CHANGED"
  | "INTERNAL_STATE_INVARIANT_FAILED";

export type GameplayCommandResult =
  | { ok: true; state: CanonicalGameState }
  | { ok: false; code: GameplayCommandFailureCode };

export interface ApplyGameplayCommandArgs {
  state: CanonicalGameState;
  seat: SeatIndex;
  command: GameplayCommand;
  serverNow: string;
  expectedController?: ControllerType;
}

function validServerTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function resolvedTrump(state: CanonicalGameState): Suit | null {
  if (state.trump.status !== "resolved") throw new Error("Trump is not resolved");
  return state.trump.suit;
}

function playerView(state: CanonicalGameState, seat: SeatIndex): PlayerView {
  return {
    deckProfile: getRuleset(state.rulesetId, state.rulesVersion).deckProfile,
    seatIndex: seat,
    hand: state.cards.hands[seat].slice(),
    cardsPerPlayer: state.progression.cardsPerPlayer,
    trump: resolvedTrump(state),
    declarations: Array.from(state.declarations.declarations),
    tricksTaken: Array.from(state.score.tricksTaken),
    currentTrick: state.cards.currentTrick.slice(),
    history: { completedTricks: state.cards.completedTricks.slice() },
  };
}

function timeoutActiveForActor(state: CanonicalGameState, actor: SeatIndex | null): boolean {
  return actor != null && state.seats[actor].controller === "temporary_bot";
}

function timingForActor(
  state: CanonicalGameState,
  actor: SeatIndex | null,
  serverNow: string,
  preserveDeadline = false,
): CanonicalGameState["timing"] {
  if (actor == null) return { currentHumanDeadline: null, timeoutTakeoverActive: false };
  const controller = state.seats[actor].controller;
  return {
    currentHumanDeadline:
      controller === "human"
        ? preserveDeadline && state.progression.currentActorSeat === actor
          ? state.timing.currentHumanDeadline
          : humanDeadlineFromServerTime(serverNow)
        : null,
    timeoutTakeoverActive: timeoutActiveForActor(state, actor),
  };
}

function forbiddenDealerValue(state: CanonicalGameState, seat: SeatIndex): number | null {
  const dealerSeat = state.progression.dealerSeat;
  if (dealerSeat == null || seat !== dealerSeat) return null;
  const others = state.declarations.declarations.filter((_, index) => index !== seat);
  if (others.some((value) => value == null)) return null;
  const sum = others.reduce<number>((total, value) => total + (value ?? 0), 0);
  const forbidden = state.progression.cardsPerPlayer - sum;
  return forbidden >= 0 && forbidden <= state.progression.cardsPerPlayer ? forbidden : null;
}

function applyDeclarationCommand(
  state: CanonicalGameState,
  seat: SeatIndex,
  value: number,
  serverNow: string,
): GameplayCommandResult {
  if (state.progression.phase !== "DECLARATION") return { ok: false, code: "WRONG_PHASE" };
  const dealerSeat = state.progression.dealerSeat;
  const firstLeaderSeat = state.progression.firstLeaderSeat;
  if (dealerSeat == null || firstLeaderSeat == null) {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  if (state.declarations.currentDeclarerSeat !== seat || state.progression.currentActorSeat !== seat) {
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  }
  if (seat === dealerSeat && state.declarations.forbiddenDealerValue === value) {
    return { ok: false, code: "FORBIDDEN_DEALER_DECLARATION" };
  }

  let declarations: CanonicalGameState["declarations"]["declarations"];
  try {
    declarations = applyDeclaration({
      cardsPerPlayer: state.progression.cardsPerPlayer,
      dealerSeat,
      seatIndex: seat,
      declarations: state.declarations.declarations,
      declared: value,
    });
  } catch {
    return { ok: false, code: "INVALID_DECLARATION" };
  }

  if (declarationsAreComplete(declarations)) {
    const actor = firstLeaderSeat;
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "CARD_PLAY", currentActorSeat: actor },
        declarations: {
          ...state.declarations,
          currentDeclarerSeat: null,
          declarations,
          legalValues: [],
          forbiddenDealerValue: null,
        },
        timing: timingForActor(state, actor, serverNow),
      },
    };
  }

  const actor = nextDeclarer(dealerSeat, declarations);
  if (actor == null) return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  const declarationState: CanonicalGameState["declarations"] = {
    ...state.declarations,
    currentDeclarerSeat: actor,
    declarations,
    legalValues: legalDeclarationValues({
      cardsPerPlayer: state.progression.cardsPerPlayer,
      dealerSeat,
      seatIndex: actor,
      declarations,
    }),
    forbiddenDealerValue: null,
  };

  const intermediate = { ...state, declarations: declarationState } as CanonicalGameState;
  declarationState.forbiddenDealerValue = forbiddenDealerValue(intermediate, actor);

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: { ...state.progression, currentActorSeat: actor },
      declarations: declarationState,
      timing: timingForActor(state, actor, serverNow),
    },
  };
}

function applyTrumpChoice(
  state: CanonicalGameState,
  seat: SeatIndex,
  suit: Suit | null,
  serverNow: string,
): GameplayCommandResult {
  if (state.progression.phase !== "NINE_CARD_TRUMP_CHOICE") return { ok: false, code: "WRONG_PHASE" };
  if (
    state.trump.status !== "chooser_pending" ||
    state.trump.chooserSeat !== seat ||
    state.progression.currentActorSeat !== seat
  ) return { ok: false, code: "NOT_CURRENT_ACTOR" };
  if (suit !== null && !SUITS.includes(suit)) return { ok: false, code: "INVALID_TRUMP_CHOICE" };

  const dealerSeat = state.progression.dealerSeat;
  const actor = state.progression.firstDeclarerSeat;
  if (dealerSeat == null || actor == null) return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };

  let completed;
  try {
    completed = completeNineCardDeal(state.cards.deck, dealerSeat, {
      cursor: state.cards.drawCursor,
      hands: state.cards.hands,
    });
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }

  const declarations: CanonicalGameState["declarations"]["declarations"] = [null, null, null, null];
  const declarationState: CanonicalGameState["declarations"] = {
    ...state.declarations,
    currentDeclarerSeat: actor,
    declarations,
    legalValues: legalDeclarationValues({ cardsPerPlayer: 9, dealerSeat, seatIndex: actor, declarations }),
    forbiddenDealerValue: null,
  };

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: { ...state.progression, phase: "DECLARATION", currentActorSeat: actor },
      cards: {
        ...state.cards,
        hands: completed.hands,
        drawCursor: completed.cursor,
        hiddenPartialNineCardHands: false,
        exposedTrumpCard: null,
      },
      declarations: declarationState,
      trump: { status: "resolved", suit },
      timing: timingForActor(state, actor, serverNow),
    },
  };
}

function removeCard(hand: readonly Card[], cardId: string): Card[] | null {
  const index = hand.findIndex((card) => card.id === cardId);
  if (index < 0) return null;
  const next = hand.slice();
  next.splice(index, 1);
  return next;
}

function completeCommittedPlay(args: {
  state: CanonicalGameState;
  seat: SeatIndex;
  play: PlayedCard;
  nextHand: Card[];
  serverNow: string;
}): GameplayCommandResult {
  const { state, seat, play, nextHand, serverNow } = args;
  const hands = state.cards.hands.map((hand) => hand.slice()) as CanonicalGameState["cards"]["hands"];
  hands[seat] = nextHand;
  const currentTrick = [...state.cards.currentTrick, play];

  if (currentTrick.length < 4) {
    const actor = nextSeat(seat);
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "CARD_PLAY", currentActorSeat: actor },
        cards: { ...state.cards, hands, currentTrick },
        joker: { pendingForSeat: null, cardId: null, semantic: null },
        timing: timingForActor(state, actor, serverNow),
      },
    };
  }

  let resolution;
  try {
    resolution = resolveTrick({ plays: currentTrick, trump: resolvedTrump(state) });
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }

  const tricksTaken = [...state.score.tricksTaken] as CanonicalGameState["score"]["tricksTaken"];
  const winner = resolution.winnerSeat as SeatIndex;
  tricksTaken[winner] += 1;
  const dealFinished = hands.every((hand) => hand.length === 0);
  const actor = dealFinished ? null : winner;

  return {
    ok: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      progression: {
        ...state.progression,
        phase: dealFinished ? "DEAL_RESULT" : "CARD_PLAY",
        currentActorSeat: actor,
      },
      cards: {
        ...state.cards,
        hands,
        currentTrick: [],
        completedTricks: [...state.cards.completedTricks, { cards: currentTrick, winnerSeat: winner }],
      },
      joker: { pendingForSeat: null, cardId: null, semantic: null },
      score: { ...state.score, tricksTaken },
      timing: timingForActor(state, actor, serverNow),
    },
  };
}

function applyCardPlay(
  state: CanonicalGameState,
  seat: SeatIndex,
  cardId: string,
  serverNow: string,
): GameplayCommandResult {
  if (state.progression.phase !== "CARD_PLAY") return { ok: false, code: "WRONG_PHASE" };
  if (state.progression.currentActorSeat !== seat) return { ok: false, code: "NOT_CURRENT_ACTOR" };

  let legal: Card[];
  try {
    legal = legalMoves(playerView(state, seat));
  } catch {
    return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  }
  const card = legal.find((candidate) => candidate.id === cardId);
  if (!card) return { ok: false, code: "ILLEGAL_CARD" };

  if (card.kind === "joker") {
    return {
      ok: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        progression: { ...state.progression, phase: "JOKER_DECISION", currentActorSeat: seat },
        joker: { pendingForSeat: seat, cardId: card.id, semantic: null },
        timing: timingForActor(state, seat, serverNow, true),
      },
    };
  }

  const nextHand = removeCard(state.cards.hands[seat], card.id);
  if (!nextHand) return { ok: false, code: "ILLEGAL_CARD" };
  return completeCommittedPlay({ state, seat, play: { seatIndex: seat, card }, nextHand, serverNow });
}

function validJokerSemantic(state: CanonicalGameState, semantic: JokerSemantic): boolean {
  if (state.cards.currentTrick.length === 0) {
    return semantic.context === "LEAD" &&
      (semantic.mode === "HIGHER_SUIT" || semantic.mode === "SUIT_WINS") &&
      SUITS.includes(semantic.requestedSuit);
  }
  return semantic.context === "OPEN_TRICK" &&
    (semantic.mode === "COMPETE" || semantic.mode === "FROM_BELOW");
}

function applyJokerChoice(
  state: CanonicalGameState,
  seat: SeatIndex,
  semantic: JokerSemantic,
  serverNow: string,
): GameplayCommandResult {
  if (state.progression.phase !== "JOKER_DECISION") return { ok: false, code: "WRONG_PHASE" };
  if (state.progression.currentActorSeat !== seat || state.joker.pendingForSeat !== seat) {
    return { ok: false, code: "NOT_CURRENT_ACTOR" };
  }
  if (!state.joker.cardId) return { ok: false, code: "JOKER_CHOICE_REQUIRED" };
  if (!validJokerSemantic(state, semantic)) return { ok: false, code: "INVALID_JOKER_CHOICE" };

  const card = state.cards.hands[seat].find((candidate) => candidate.id === state.joker.cardId);
  if (!card || card.kind !== "joker") return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  const nextHand = removeCard(state.cards.hands[seat], card.id);
  if (!nextHand) return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };

  return completeCommittedPlay({
    state,
    seat,
    play: { seatIndex: seat, card, joker: semantic },
    nextHand,
    serverNow,
  });
}

/** Human and bot callers use this same pure transition surface. */
export function applyGameplayCommand(args: ApplyGameplayCommandArgs): GameplayCommandResult {
  const { state, seat, command, serverNow, expectedController } = args;
  try { getRuleset(state.rulesetId, state.rulesVersion); } catch { return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" }; }
  if (command.type === "choose_trump" && getRuleset(state.rulesetId, state.rulesVersion).nineCardTrump !== "chooser") return { ok: false, code: "WRONG_PHASE" };
  if (!validServerTime(serverNow)) return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  if (state.lifecycle !== "active") return { ok: false, code: "WRONG_PHASE" };
  if (state.seats[seat]?.seatIndex !== seat) return { ok: false, code: "INTERNAL_STATE_INVARIANT_FAILED" };
  if (expectedController && state.seats[seat].controller !== expectedController) {
    return { ok: false, code: "CONTROLLER_CHANGED" };
  }

  switch (command.type) {
    case "declare":
      return applyDeclarationCommand(state, seat, command.value, serverNow);
    case "choose_trump":
      return applyTrumpChoice(state, seat, command.suit, serverNow);
    case "play_card":
      return applyCardPlay(state, seat, command.cardId, serverNow);
    case "choose_joker_semantic":
      return applyJokerChoice(state, seat, command.semantic, serverNow);
  }
}
