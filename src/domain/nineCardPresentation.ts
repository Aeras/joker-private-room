import { presentationBoundary, PRESENTATION_RECOVERY_ALLOWANCE_MS } from "./dealPresentationBarrier";
import { humanDeadlineFromServerTime } from "./controller";
import { legalDeclarationValues } from "./declarations";
import type { SeatIndex } from "./dealing";
import type { CanonicalGameState } from "./gameState";

export const NINE_CARD_INITIAL_PRESENTATION_FALLBACK_MS = 8_000;
export const NINE_CARD_REMAINING_PRESENTATION_FALLBACK_MS = 15_000;

function timingForActor(state: CanonicalGameState, actor: SeatIndex, serverNow: string) {
  const controller = state.seats[actor].controller;
  return {
    currentHumanDeadline: controller === "human" ? humanDeadlineFromServerTime(serverNow) : null,
    timeoutTakeoverActive: controller === "temporary_bot",
    presentationReadyAt: null,
  };
}

function hasHumanOwner(state: CanonicalGameState): boolean {
  return state.seats.some((seat) => seat.owner.type === "human");
}

function presentationReadyAt(serverNow: string, delayMs: number): string {
  const now = Date.parse(serverNow);
  if (!Number.isFinite(now)) throw new Error("Invalid server time");
  return new Date(now + delayMs).toISOString();
}

export function isNineCardPresentationBarrier(state: CanonicalGameState): boolean {
  return state.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ||
    state.progression.phase === "NINE_CARD_REMAINING_DEAL";
}

export function nineCardPresentationFallbackIsDue(state: CanonicalGameState, serverNow: string): boolean {
  if (!isNineCardPresentationBarrier(state) || !state.timing.presentationReadyAt) return false;
  const readyAt = Date.parse(state.timing.presentationReadyAt);
  const now = Date.parse(serverNow);
  return Number.isFinite(readyAt) && Number.isFinite(now) && readyAt <= now;
}

/**
 * A freshly-created chooser-style nine-card deal is converted into a
 * non-interactive presentation stage only when the game has a human owner.
 * Pure/all-bot simulations have no observer to protect and stay on the direct
 * canonical route. A durable fallback time prevents a missing browser ack from
 * deadlocking a real multiplayer game.
 */
export function holdNineCardInitialDealForPresentation(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (
    !hasHumanOwner(state) ||
    state.lifecycle !== "active" ||
    state.progression.phase !== "NINE_CARD_TRUMP_CHOICE" ||
    state.progression.cardsPerPlayer !== 9 ||
    state.progression.dealerSeat == null ||
    state.progression.firstDeclarerSeat == null ||
    state.trump.status !== "chooser_pending" ||
    state.cards.hands.some((hand) => hand.length !== 3) ||
    !state.cards.hiddenPartialNineCardHands
  ) return state;

  return {
    ...state,
    progression: {
      ...state.progression,
      phase: "NINE_CARD_INITIAL_DEAL_ALL_SEATS",
      currentActorSeat: null,
    },
    declarations: {
      ...state.declarations,
      currentDeclarerSeat: null,
      legalValues: [],
      forbiddenDealerValue: null,
    },
    timing: {
      currentHumanDeadline: null,
      timeoutTakeoverActive: false,
      presentationBoundary: presentationBoundary(state, "initial"),
      presentationReadyAt: presentationReadyAt(serverNow, NINE_CARD_INITIAL_PRESENTATION_FALLBACK_MS + PRESENTATION_RECOVERY_ALLOWANCE_MS),
    },
  };
}

export function activateNineCardTrumpChoiceAfterPresentation(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (
    state.lifecycle !== "active" ||
    state.progression.phase !== "NINE_CARD_INITIAL_DEAL_ALL_SEATS" ||
    state.progression.cardsPerPlayer !== 9 ||
    state.progression.dealerSeat == null ||
    state.progression.firstDeclarerSeat == null ||
    state.trump.status !== "chooser_pending" ||
    state.cards.hands.some((hand) => hand.length !== 3) ||
    !state.cards.hiddenPartialNineCardHands
  ) {
    throw new Error("Nine-card initial presentation barrier is not ready");
  }

  const actor = state.trump.chooserSeat;
  if (actor !== state.progression.firstDeclarerSeat) {
    throw new Error("Nine-card chooser does not match first declarer");
  }

  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    progression: {
      ...state.progression,
      phase: "NINE_CARD_TRUMP_CHOICE",
      currentActorSeat: actor,
    },
    declarations: {
      ...state.declarations,
      currentDeclarerSeat: null,
      legalValues: [],
      forbiddenDealerValue: null,
    },
    timing: timingForActor(state, actor, serverNow),
  };
}

export function holdNineCardRemainingDealForPresentation(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (!hasHumanOwner(state)) return state;
  if (
    state.lifecycle !== "active" ||
    state.progression.phase !== "NINE_CARD_REMAINING_DEAL" ||
    state.progression.cardsPerPlayer !== 9 ||
    state.trump.status !== "resolved" ||
    state.cards.hands.some((hand) => hand.length !== 9)
  ) return state;

  return {
    ...state,
    timing: {
      currentHumanDeadline: null,
      timeoutTakeoverActive: false,
      presentationBoundary: presentationBoundary(state, "remaining"),
      presentationReadyAt: presentationReadyAt(serverNow, NINE_CARD_REMAINING_PRESENTATION_FALLBACK_MS + PRESENTATION_RECOVERY_ALLOWANCE_MS),
    },
  };
}

export function activateNineCardDeclarationAfterPresentation(
  state: CanonicalGameState,
  serverNow: string,
): CanonicalGameState {
  if (
    state.lifecycle !== "active" ||
    state.progression.phase !== "NINE_CARD_REMAINING_DEAL" ||
    state.progression.cardsPerPlayer !== 9 ||
    state.progression.dealerSeat == null ||
    state.progression.firstDeclarerSeat == null ||
    state.trump.status !== "resolved" ||
    state.cards.hands.some((hand) => hand.length !== 9 || state.cards.hiddenPartialNineCardHands)
  ) {
    throw new Error("Nine-card remaining presentation barrier is not ready");
  }

  const actor = state.progression.firstDeclarerSeat;
  const declarations: CanonicalGameState["declarations"]["declarations"] = [null, null, null, null];

  return {
    ...state,
    stateVersion: state.stateVersion + 1,
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
        cardsPerPlayer: 9,
        dealerSeat: state.progression.dealerSeat,
        seatIndex: actor,
        declarations,
      }),
      forbiddenDealerValue: null,
    },
    timing: timingForActor(state, actor, serverNow),
  };
}
