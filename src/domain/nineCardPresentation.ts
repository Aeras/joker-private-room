import { humanDeadlineFromServerTime } from "./controller";
import { legalDeclarationValues } from "./declarations";
import type { SeatIndex } from "./dealing";
import type { CanonicalGameState } from "./gameState";

function timingForActor(state: CanonicalGameState, actor: SeatIndex, serverNow: string) {
  const controller = state.seats[actor].controller;
  return {
    currentHumanDeadline: controller === "human" ? humanDeadlineFromServerTime(serverNow) : null,
    timeoutTakeoverActive: controller === "temporary_bot",
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
    state.cards.hands.some((hand) => hand.length !== 9) ||
    state.cards.hiddenPartialNineCardHands
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
