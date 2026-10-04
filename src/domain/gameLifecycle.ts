import { createDeck, shuffleCards } from "./cards";
import { humanDeadlineFromServerTime } from "./controller";
import { declarationOrder, legalDeclarationValues, type Declarations } from "./declarations";
import { dealNineCardInitial, dealWithTrumpReveal, nextSeat, type SeatIndex } from "./dealing";
import { DEALS, dealsOfPhase } from "./gameConfig";
import type {
  CanonicalDealScoreRecord,
  CanonicalGameState,
  CanonicalRoundPremiaRecord,
} from "./gameState";
import { resolvePremia, type RoundDealOutcome } from "./premia";
import { rankFinalScores } from "./ranking";
import { scoreDeal } from "./scoring";

export type LifecycleTransitionResult =
  | { ok: true; changed: false; state: CanonicalGameState }
  | { ok: true; changed: true; state: CanonicalGameState; transition: "DEAL_SETTLED" | "ROUND_SETTLED" }
  | { ok: false; code: "INVALID_LIFECYCLE_STATE" };

function validServerTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function tuple4(values: readonly number[]): [number, number, number, number] {
  if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Expected four finite values");
  }
  return [values[0]!, values[1]!, values[2]!, values[3]!];
}

function completedDeals(state: CanonicalGameState): CanonicalDealScoreRecord[] {
  return (state.score.completedDeals ?? []).map((record) => ({
    ...record,
    declarations: [...record.declarations] as CanonicalDealScoreRecord["declarations"],
    tricksTaken: [...record.tricksTaken] as CanonicalDealScoreRecord["tricksTaken"],
    dealScores: [...record.dealScores] as CanonicalDealScoreRecord["dealScores"],
    totalsAfterDeal: [...record.totalsAfterDeal] as CanonicalDealScoreRecord["totalsAfterDeal"],
  }));
}

function roundPremia(state: CanonicalGameState): CanonicalRoundPremiaRecord[] {
  return (state.score.roundPremia ?? []).map((record) => ({
    ...record,
    qualified: [...record.qualified] as CanonicalRoundPremiaRecord["qualified"],
    adjustments: [...record.adjustments] as CanonicalRoundPremiaRecord["adjustments"],
    transfers: record.transfers.map((transfer) => ({ ...transfer })),
    totalsAfterPremia: [...record.totalsAfterPremia] as CanonicalRoundPremiaRecord["totalsAfterPremia"],
  }));
}

function declarationsTuple(state: CanonicalGameState): [number, number, number, number] | null {
  const values = state.declarations.declarations;
  if (values.some((value) => value == null)) return null;
  return values as [number, number, number, number];
}

function dealScoresFor(
  declarations: readonly number[],
  tricksTaken: readonly number[],
  cardsPerPlayer: number,
): [number, number, number, number] {
  return tuple4(
    [0, 1, 2, 3].map((seat) =>
      scoreDeal({
        declared: declarations[seat]!,
        taken: tricksTaken[seat]!,
        tricksInDeal: cardsPerPlayer,
      }),
    ),
  );
}

function isLastDealOfRound(state: CanonicalGameState): boolean {
  const roundDeals = dealsOfPhase(state.progression.round);
  return state.progression.indexInPhase === roundDeals.length;
}

function initialDeclarations(dealerSeat: SeatIndex, firstDeclarerSeat: SeatIndex, cardsPerPlayer: number) {
  const declarations: Declarations = [null, null, null, null];
  return {
    order: declarationOrder(dealerSeat) as [SeatIndex, SeatIndex, SeatIndex, SeatIndex],
    currentDeclarerSeat: firstDeclarerSeat,
    declarations,
    legalValues: legalDeclarationValues({
      cardsPerPlayer,
      dealerSeat,
      seatIndex: firstDeclarerSeat,
      declarations,
    }),
    forbiddenDealerValue: null,
  } satisfies CanonicalGameState["declarations"];
}

function nextDealState(
  state: CanonicalGameState,
  random: () => number,
  serverNow: string,
): CanonicalGameState {
  const nextInfo = DEALS[state.progression.dealNumber];
  const currentDealer = state.progression.dealerSeat;
  if (!nextInfo || currentDealer == null) throw new Error("Missing next deal or dealer");

  const dealerSeat = nextSeat(currentDealer);
  const firstDeclarerSeat = nextSeat(dealerSeat);
  const firstLeaderSeat = firstDeclarerSeat;
  const deck = shuffleCards(createDeck(), random);
  const actorController = state.seats[firstDeclarerSeat].controller;
  const baseTiming = {
    currentHumanDeadline:
      actorController === "human" ? humanDeadlineFromServerTime(serverNow) : null,
    timeoutTakeoverActive: actorController === "temporary_bot",
  };

  if (nextInfo.cardsPerPlayer === 9) {
    const initial = dealNineCardInitial(deck, dealerSeat);
    return {
      ...state,
      stateVersion: state.stateVersion + 1,
      lifecycle: "active",
      progression: {
        round: nextInfo.phase,
        dealNumber: nextInfo.dealNumber,
        indexInPhase: nextInfo.indexInPhase,
        cardsPerPlayer: 9,
        dealerSeat,
        firstDeclarerSeat,
        firstLeaderSeat,
        currentActorSeat: firstDeclarerSeat,
        phase: "NINE_CARD_TRUMP_CHOICE",
      },
      cards: {
        deck,
        drawCursor: initial.cursor,
        hands: initial.hands,
        hiddenPartialNineCardHands: true,
        exposedTrumpCard: null,
        currentTrick: [],
        completedTricks: [],
      },
      declarations: initialDeclarations(dealerSeat, firstDeclarerSeat, 9),
      trump: { status: "chooser_pending", chooserSeat: firstDeclarerSeat },
      joker: { pendingForSeat: null, cardId: null, semantic: null },
      score: {
        ...state.score,
        tricksTaken: [0, 0, 0, 0],
        currentDealScores: [null, null, null, null],
      },
      timing: baseTiming,
    };
  }

  const dealt = dealWithTrumpReveal(deck, dealerSeat, nextInfo.cardsPerPlayer);
  return {
    ...state,
    stateVersion: state.stateVersion + 1,
    lifecycle: "active",
    progression: {
      round: nextInfo.phase,
      dealNumber: nextInfo.dealNumber,
      indexInPhase: nextInfo.indexInPhase,
      cardsPerPlayer: nextInfo.cardsPerPlayer,
      dealerSeat,
      firstDeclarerSeat,
      firstLeaderSeat,
      currentActorSeat: firstDeclarerSeat,
      phase: "DECLARATION",
    },
    cards: {
      deck,
      drawCursor: dealt.cursor,
      hands: dealt.hands,
      hiddenPartialNineCardHands: false,
      exposedTrumpCard: dealt.revealedTrumpCard,
      currentTrick: [],
      completedTricks: [],
    },
    declarations: initialDeclarations(dealerSeat, firstDeclarerSeat, nextInfo.cardsPerPlayer),
    trump: { status: "resolved", suit: dealt.trump },
    joker: { pendingForSeat: null, cardId: null, semantic: null },
    score: {
      ...state.score,
      tricksTaken: [0, 0, 0, 0],
      currentDealScores: [null, null, null, null],
    },
    timing: baseTiming,
  };
}

function settleDeal(
  state: CanonicalGameState,
  random: (() => number) | null,
  serverNow: string,
): LifecycleTransitionResult {
  const declarations = declarationsTuple(state);
  if (!declarations) return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if (state.cards.hands.some((hand) => hand.length !== 0) || state.cards.currentTrick.length !== 0) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  const trickTotal = state.score.tricksTaken.reduce((sum, value) => sum + value, 0);
  if (trickTotal !== state.progression.cardsPerPlayer) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }

  const dealScores = dealScoresFor(declarations, state.score.tricksTaken, state.progression.cardsPerPlayer);
  const totalsAfterDeal = tuple4(
    state.score.cumulativeTotals.map((total, seat) => total + dealScores[seat]!),
  );
  const record: CanonicalDealScoreRecord = {
    dealNumber: state.progression.dealNumber,
    round: state.progression.round,
    indexInPhase: state.progression.indexInPhase,
    cardsPerPlayer: state.progression.cardsPerPlayer,
    declarations: [...declarations],
    tricksTaken: [...state.score.tricksTaken] as CanonicalDealScoreRecord["tricksTaken"],
    dealScores,
    totalsAfterDeal,
  };
  const history = completedDeals(state);
  if (history.some((existing) => existing.dealNumber === record.dealNumber)) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
  history.push(record);

  const scored: CanonicalGameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    progression: {
      ...state.progression,
      phase: isLastDealOfRound(state) ? "PHASE_RESULT" : state.progression.phase,
      currentActorSeat: null,
    },
    score: {
      ...state.score,
      currentDealScores: dealScores,
      cumulativeTotals: totalsAfterDeal,
      completedDeals: history,
      roundPremia: roundPremia(state),
    },
    timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
  };

  if (isLastDealOfRound(state)) {
    return { ok: true, changed: true, state: scored, transition: "DEAL_SETTLED" };
  }
  if (!random) return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  try {
    const next = nextDealState(scored, random, serverNow);
    return { ok: true, changed: true, state: next, transition: "DEAL_SETTLED" };
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
}

function settleRound(
  state: CanonicalGameState,
  random: (() => number) | null,
  serverNow: string,
): LifecycleTransitionResult {
  const history = completedDeals(state);
  const round = state.progression.round;
  const expected = dealsOfPhase(round);
  const roundRecords = history.filter((record) => record.round === round);
  if (roundRecords.length !== expected.length) return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if ((state.score.roundPremia ?? []).some((record) => record.round === round)) {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }

  const outcomes: RoundDealOutcome[] = roundRecords.map((record) => ({
    indexInPhase: record.indexInPhase,
    cardsPerPlayer: record.cardsPerPlayer,
    declarations: [...record.declarations],
    tricksTaken: [...record.tricksTaken],
  }));
  let premia;
  try {
    premia = resolvePremia(round, outcomes);
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }

  const totalsAfterPremia = tuple4(
    state.score.cumulativeTotals.map((total, seat) => total + premia.adjustments[seat]!),
  );
  const premiaRecord: CanonicalRoundPremiaRecord = {
    round,
    qualified: [...premia.qualified],
    adjustments: [...premia.adjustments],
    transfers: premia.transfers.map((transfer) => ({ ...transfer })),
    totalsAfterPremia,
  };
  const premiaHistory = [...roundPremia(state), premiaRecord];
  const finalDeal = state.progression.dealNumber === DEALS.length;

  if (finalDeal) {
    const placements: [number | null, number | null, number | null, number | null] = [null, null, null, null];
    for (const ranked of rankFinalScores(totalsAfterPremia)) {
      placements[ranked.seatIndex] = ranked.placement;
    }
    return {
      ok: true,
      changed: true,
      transition: "ROUND_SETTLED",
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        lifecycle: "complete",
        progression: { ...state.progression, phase: "GAME_COMPLETE", currentActorSeat: null },
        score: {
          ...state.score,
          cumulativeTotals: totalsAfterPremia,
          finalPlacements: placements,
          completedDeals: history,
          roundPremia: premiaHistory,
        },
        timing: { currentHumanDeadline: null, timeoutTakeoverActive: false },
      },
    };
  }

  if (!random) return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  try {
    const settled: CanonicalGameState = {
      ...state,
      stateVersion: state.stateVersion + 1,
      score: {
        ...state.score,
        cumulativeTotals: totalsAfterPremia,
        completedDeals: history,
        roundPremia: premiaHistory,
      },
    };
    const next = nextDealState(settled, random, serverNow);
    return { ok: true, changed: true, state: next, transition: "ROUND_SETTLED" };
  } catch {
    return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  }
}

/**
 * Settles one internal lifecycle boundary. Randomness is required only when the
 * transition also initializes the next deal. Game rules stay pure and testable.
 */
export function settleCanonicalLifecycle(args: {
  state: CanonicalGameState;
  nextDealRandom?: () => number;
  serverNow: string;
}): LifecycleTransitionResult {
  if (!validServerTime(args.serverNow)) return { ok: false, code: "INVALID_LIFECYCLE_STATE" };
  if (args.state.lifecycle !== "active") return { ok: true, changed: false, state: args.state };
  if (args.state.progression.phase === "DEAL_RESULT") {
    return settleDeal(args.state, args.nextDealRandom ?? null, args.serverNow);
  }
  if (args.state.progression.phase === "PHASE_RESULT") {
    return settleRound(args.state, args.nextDealRandom ?? null, args.serverNow);
  }
  return { ok: true, changed: false, state: args.state };
}
