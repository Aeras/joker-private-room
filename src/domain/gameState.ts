import type { PresentationBoundary } from "./dealPresentationBarrier";
import type { RulesetId, RulesVersion } from "./rulesets";
import type { Card, Suit } from "./cards";
import type { Declarations } from "./declarations";
import type { SeatIndex } from "./dealing";
import type { JokerSemantic, PlayedCard } from "./engine";
import type { PhaseConfig } from "./gameConfig";

export const GAME_STATE_SCHEMA_VERSION = 4 as const;
export const POPULAR_RULES_VERSION = "popular-v1" as const;

export type GameLifecycle = "starting" | "active" | "complete";
export type CanonicalGameTermination = { kind: "host_ended"; endedAt: string };
export type CanonicalGamePhase =
  | "INITIAL_DEALER_SELECTION"
  | "DEAL_SETUP"
  | "DEAL_PRESENTATION"
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
export type TemporaryBotStrategyProfileId = "strong-basic-v1" | "memory-inference-v1" | "probability-simulation-v1";
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
  /** Chosen once per temporary takeover; absent for humans and permanent bots. */
  temporaryBotStrategyProfileId?: TemporaryBotStrategyProfileId;
  reclaimable: boolean;
}

export interface CanonicalProgressionState {
  round: PhaseConfig["phase"];
  dealNumber: number;
  indexInPhase: number;
  cardsPerPlayer: number;
  dealerSeat: SeatIndex | null;
  firstDeclarerSeat: SeatIndex | null;
  firstLeaderSeat: SeatIndex | null;
  currentActorSeat: SeatIndex | null;
  phase: CanonicalGamePhase;
}

export type InitialDealerSelectionState =
  | { status: "pending"; bootstrapActionId: string }
  | {
      status: "resolved";
      bootstrapActionId: string;
      openingCard?: Card;
      firstRecipientSeat: SeatIndex;
      revealedSelectionCards: Card[];
      selectedDealerSeat: SeatIndex;
      resolvedAtStateVersion: number;
    };

export interface PublicCompletedTrick {
  dealNumber: number;
  ordinal: number;
  cards: PlayedCard[];
  winnerSeat: SeatIndex;
}

export interface CanonicalCardsState {
  /** Bounded public-only history retained across deal boundaries. */
  presentationTail?: PublicCompletedTrick[];
  deck: Card[];
  drawCursor: number;
  hands: [Card[], Card[], Card[], Card[]];
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

export interface CanonicalDealScoreRecord {
  dealNumber: number;
  round: PhaseConfig["phase"];
  indexInPhase: number;
  cardsPerPlayer: number;
  declarations: [number, number, number, number];
  tricksTaken: [number, number, number, number];
  dealScores: [number, number, number, number];
  totalsAfterDeal: [number, number, number, number];
}

export interface CanonicalPremiaTransferRecord {
  bonusSeat: number;
  bonusDealIndex: number;
  bonusAmount: number;
  targetSeat: number;
  removedDealIndex: number | null;
  removedAmount: number;
}

export interface CanonicalRoundPremiaRecord {
  round: PhaseConfig["phase"];
  qualified: [boolean, boolean, boolean, boolean];
  adjustments: [number, number, number, number];
  transfers: CanonicalPremiaTransferRecord[];
  totalsAfterPremia: [number, number, number, number];
}

export interface CanonicalScoreState {
  tricksTaken: [number, number, number, number];
  currentDealScores: [number | null, number | null, number | null, number | null];
  cumulativeTotals: [number, number, number, number];
  finalPlacements: [number | null, number | null, number | null, number | null];
  completedDeals?: CanonicalDealScoreRecord[];
  roundPremia?: CanonicalRoundPremiaRecord[];
}

export interface CanonicalTimingState {
  turnPresentation?: import("./turnPresentation").TurnPresentationBoundary;
  presentationBoundary?: PresentationBoundary;
  currentHumanDeadline: string | null;
  timeoutTakeoverActive: boolean;
  /** Durable fallback for presentation barriers when no browser can acknowledge them. */
  presentationReadyAt?: string | null;
}

export interface CanonicalGameState {
  gameId: string;
  roomId: string;
  rulesetId: RulesetId;
  rulesVersion: RulesVersion;
  stateSchemaVersion: 3 | typeof GAME_STATE_SCHEMA_VERSION;
  stateVersion: number;
  lifecycle: GameLifecycle;
  termination?: CanonicalGameTermination;
  serverEntropySeed?: string;
  progression: CanonicalProgressionState;
  initialDealerSelection?: InitialDealerSelectionState;
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
  if (state.stateSchemaVersion !== expected.stateSchemaVersion) throw new Error("Canonical state schema version mismatch");
  if (state.stateVersion !== expected.nextStateVersion) throw new Error("Canonical state version mismatch");
  if (!Number.isSafeInteger(state.stateVersion) || state.stateVersion < 1) throw new Error("Canonical state version must be a positive safe integer");
  if (state.stateSchemaVersion >= 2 && !state.initialDealerSelection) throw new Error("Schema-v2+ canonical state requires initial dealer selection metadata");
  if (state.stateSchemaVersion >= 3) {
    if (!state.serverEntropySeed || !/^[0-9a-f]{64}$/i.test(state.serverEntropySeed)) throw new Error("Schema-v3 canonical state requires private server entropy");
    if (!Array.isArray(state.score.completedDeals) || !Array.isArray(state.score.roundPremia)) throw new Error("Schema-v3 canonical state requires authoritative score history");
  }
  if (state.termination?.kind === "host_ended" && state.lifecycle !== "complete") {
    throw new Error("Host-ended game must be terminal");
  }
}
