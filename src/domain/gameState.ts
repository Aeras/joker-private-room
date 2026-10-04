import type { Card, Suit } from "./cards";
import type { Declarations } from "./declarations";
import type { SeatIndex } from "./dealing";
import type { JokerSemantic, PlayedCard } from "./engine";
import type { PhaseConfig } from "./gameConfig";

export const GAME_STATE_SCHEMA_VERSION = 1 as const;
export const POPULAR_RULES_VERSION = "popular-v1" as const;

export type GameLifecycle = "starting" | "active" | "complete";
export type CanonicalGamePhase =
  | "INITIAL_DEALER_SELECTION"
  | "DEAL_SETUP"
  | "TRUMP_REVEAL_1_TO_8"
  | "NINE_CARD_INITIAL_DEAL_ALL_SEATS"
  | "NINE_CARD_TRUMP_CHOICE"
  | "NINE_CARD_REMAINING_DEAL"
  | "DECLARATION"
  | "CARD_PLAY"
  | "JOKER_DECISION"
  | "TRICK_RESOLUTION"
  | "DEAL_RESULT"
  | "PHASE_RESULT"
  | "GAME_COMPLETE";

export type ControllerType = "human" | "temporary_bot" | "permanent_bot";
export type SeatOwner =
  | { type: "human"; playerId: string }
  | {
      type: "bot";
      botId: string;
      displayName: string;
      personalityId: string;
      strategyProfileId: string;
      catalogVersion: string;
    };

export interface CanonicalSeatState {
  seatIndex: SeatIndex;
  owner: SeatOwner;
  controller: ControllerType;
  connected: boolean;
  takeoverAt: string | null;
  reclaimable: boolean;
}

export interface CanonicalProgressionState {
  round: PhaseConfig["phase"];
  dealNumber: number;
  indexInPhase: number;
  cardsPerPlayer: number;
  dealerSeat: SeatIndex;
  firstDeclarerSeat: SeatIndex;
  firstLeaderSeat: SeatIndex;
  currentActorSeat: SeatIndex | null;
  phase: CanonicalGamePhase;
}

export interface CanonicalCardsState {
  /** Server-only complete shuffled deck for the current deal. Never serialize directly to a player. */
  deck: Card[];
  drawCursor: number;
  /** Server-only owner hands, indexed by seat. */
  hands: [Card[], Card[], Card[], Card[]];
  /** True only during the corrected 9-card first-three chooser stage. */
  hiddenPartialNineCardHands: boolean;
  exposedTrumpCard: Card | null;
  currentTrick: PlayedCard[];
  completedTricks: { cards: PlayedCard[]; winnerSeat: SeatIndex }[];
}

export interface CanonicalDeclarationState {
  order: [SeatIndex, SeatIndex, SeatIndex, SeatIndex];
  currentDeclarerSeat: SeatIndex | null;
  declarations: Declarations;
  legalValues: number[];
  forbiddenDealerValue: number | null;
}

export type CanonicalTrumpState =
  | { status: "unresolved" }
  | { status: "chooser_pending"; chooserSeat: SeatIndex }
  | { status: "resolved"; suit: Suit | null };

export interface CanonicalJokerState {
  pendingForSeat: SeatIndex | null;
  cardId: string | null;
  semantic: JokerSemantic | null;
}

export interface CanonicalScoreState {
  tricksTaken: [number, number, number, number];
  currentDealScores: [number | null, number | null, number | null, number | null];
  cumulativeTotals: [number, number, number, number];
  finalPlacements: [number | null, number | null, number | null, number | null];
}

export interface CanonicalTimingState {
  currentHumanDeadline: string | null;
  timeoutTakeoverActive: boolean;
}

/**
 * The single server-only source of truth for an active game.
 * Never send this object directly to a browser. Player-facing payloads must go
 * through the dedicated seat projection layer implemented in the next phase.
 */
export interface CanonicalGameState {
  gameId: string;
  roomId: string;
  rulesetId: "popular";
  rulesVersion: typeof POPULAR_RULES_VERSION;
  stateSchemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  stateVersion: number;
  lifecycle: GameLifecycle;
  progression: CanonicalProgressionState;
  seats: [CanonicalSeatState, CanonicalSeatState, CanonicalSeatState, CanonicalSeatState];
  cards: CanonicalCardsState;
  declarations: CanonicalDeclarationState;
  trump: CanonicalTrumpState;
  joker: CanonicalJokerState;
  score: CanonicalScoreState;
  timing: CanonicalTimingState;
}

export function assertCanonicalGameStateIdentity(
  state: CanonicalGameState,
  expected: {
    gameId: string;
    roomId: string;
    rulesVersion: string;
    stateSchemaVersion: number;
    nextStateVersion: number;
  },
): void {
  if (state.gameId !== expected.gameId) throw new Error("Canonical state gameId mismatch");
  if (state.roomId !== expected.roomId) throw new Error("Canonical state roomId mismatch");
  if (state.rulesVersion !== expected.rulesVersion) throw new Error("Canonical state rulesVersion mismatch");
  if (state.stateSchemaVersion !== expected.stateSchemaVersion) {
    throw new Error("Canonical state schema version mismatch");
  }
  if (state.stateVersion !== expected.nextStateVersion) {
    throw new Error("Canonical state version mismatch");
  }
  if (!Number.isSafeInteger(state.stateVersion) || state.stateVersion < 1) {
    throw new Error("Canonical state version must be a positive safe integer");
  }
}
