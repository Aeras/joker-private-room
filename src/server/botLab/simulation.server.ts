import { selectBaselineGameplayCommand } from "@/bots/baselineRuntime";
import { selectCompetitiveCommand } from "@/bots/competitiveRuntime";
import { COMPETITIVE_VERSION } from "@/bots/competitive";
import {
  createInitialDealerBootstrapState,
  resolveDealerBootstrapAndInitializeDealOne,
  activateDealOneAfterPresentation,
} from "@/domain/dealerBootstrap";
import { applyGameplayCommand, type GameplayCommand } from "@/domain/gameplayCommands";
import { settleCanonicalLifecycle } from "@/domain/gameLifecycle";
import { projectGameForSeat, type PlayerGameProjection } from "@/domain/projection";
import type {
  CanonicalDealScoreRecord,
  CanonicalRoundPremiaRecord,
  CanonicalGameState,
} from "@/domain/gameState";
import { getRuleset, RULESETS, type RulesetId } from "@/domain/rulesets";
import { DEALS } from "@/domain/gameConfig";
import type { SeatIndex } from "@/domain/dealing";

export const BASELINE_STRATEGY_VERSION = "main-ed508598";
export const LAB_TIERS = [
  "strong-basic-v1",
  "memory-inference-v1",
  "probability-simulation-v1",
] as const;
export type LabTier = (typeof LAB_TIERS)[number];
export type LabLineup = [LabTier, LabTier, LabTier, LabTier];
export interface SimulationConfig {
  seed: number;
  ruleset: RulesetId;
  lineup: LabLineup;
  /** Physical seat occupied by lineup[0]; rotate 0..3 for matched comparisons. */
  rotation?: SeatIndex;
  strategyVersion: string;
  seatVersions?: [string, string, string, string];
}
export interface DecisionRecord {
  version: number;
  dealNumber: number;
  seat: SeatIndex;
  tier: LabTier;
  phase: CanonicalGameState["progression"]["phase"];
  command: GameplayCommand;
  latencyMs: number;
}
export interface SimulationResult {
  config: SimulationConfig;
  selectedDealer: SeatIndex;
  steps: number;
  scores: [number, number, number, number];
  placements: [number, number, number, number];
  /** Seat mapping is recorded rather than guessing it from aggregate tier labels. */
  physicalLineup: LabLineup;
  deals: CanonicalDealScoreRecord[];
  premia: CanonicalRoundPremiaRecord[];
  decisions: DecisionRecord[];
  tricks: Array<{
    dealNumber: number;
    cards: CanonicalGameState["cards"]["currentTrick"];
    winnerSeat: number;
  }>;
}
export interface SimulationControl {
  cancelled?: () => boolean;
  now?: () => number;
  /** Receives one seat-safe projection, never the canonical hidden state. */
  select?: (projection: PlayerGameProjection) => GameplayCommand | null;
}
export class SimulationFailure extends Error {
  constructor(
    public readonly code:
      "CANCELLED" | "STEP_BOUND" | "NO_ACTION" | "REJECTED_ACTION" | "LIFECYCLE" | "INVALID_RESULT",
    message: string,
  ) {
    super(message);
    this.name = "SimulationFailure";
  }
}

export function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}
export function validateSimulationConfig(config: SimulationConfig): void {
  if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed > 0xffffffff)
    throw new Error("Invalid seed");
  if (
    ![BASELINE_STRATEGY_VERSION, "baseline", COMPETITIVE_VERSION].includes(
      config.strategyVersion,
    ) ||
    (config.seatVersions &&
      (config.seatVersions.length !== 4 ||
        config.seatVersions.some(
          (v) => ![BASELINE_STRATEGY_VERSION, COMPETITIVE_VERSION].includes(v),
        )))
  )
    throw new Error("Invalid strategy version");
  if (!Object.hasOwn(RULESETS, config.ruleset)) throw new Error("Invalid ruleset");
  if (config.lineup.length !== 4 || config.lineup.some((tier) => !LAB_TIERS.includes(tier)))
    throw new Error("Invalid lineup");
  if (
    !Number.isInteger(config.rotation ?? 0) ||
    (config.rotation ?? 0) < 0 ||
    (config.rotation ?? 0) > 3
  )
    throw new Error("Invalid rotation");
}

/** Isolated, all-bot full game. No DB, network, live rooms, sleep or UI imports.
 * Presentation holds have no human observers, so the canonical all-bot route
 * has no delay. We never remove holds from a real multiplayer state. */
export function simulateFullGame(
  config: SimulationConfig,
  control: SimulationControl = {},
): SimulationResult {
  validateSimulationConfig(config);
  const rotation = config.rotation ?? 0;
  const physicalLineup = [0, 1, 2, 3].map(
    (seat) => config.lineup[(seat - rotation + 4) % 4]!,
  ) as LabLineup;
  const policy = getRuleset(config.ruleset, RULESETS[config.ruleset].version);
  const selectionRandom = seededRandom(config.seed ^ 0xa5a5a5a5);
  // Separate deck streams: additional semantic commands never consume shuffle RNG.
  const firstDealRandom = seededRandom(config.seed ^ 0x3c6ef372);
  const laterDealRandom = seededRandom(config.seed ^ 0x9e3779b9);
  const serverNow = "2026-10-09T00:00:00.000Z";
  const pending = createInitialDealerBootstrapState({
    gameId: "00000000-0000-4000-8000-00000000b001",
    roomId: "00000000-0000-4000-8000-00000000b002",
    bootstrapActionId: "00000000-0000-4000-8000-00000000b003",
    serverEntropySeed: "ab".repeat(32),
    rulesetId: policy.id,
    rulesVersion: policy.version,
    seats: ([0, 1, 2, 3] as const).map((seatIndex) => ({
      seatIndex,
      connected: false,
      owner: {
        type: "bot" as const,
        botId: `lab-${seatIndex}`,
        displayName: `Lab ${seatIndex}`,
        personalityId: "lab",
        strategyProfileId: physicalLineup[seatIndex],
        catalogVersion: "lab-v1",
      },
    })) as Parameters<typeof createInitialDealerBootstrapState>[0]["seats"],
  });
  const bootstrap = resolveDealerBootstrapAndInitializeDealOne({
    state: pending,
    firstRecipientRandom: selectionRandom,
    selectionShuffleRandom: selectionRandom,
    dealOneShuffleRandom: firstDealRandom,
    serverNow,
  });
  let state = activateDealOneAfterPresentation(bootstrap, serverNow);
  const selectedDealer = state.progression.dealerSeat!;
  const decisions: DecisionRecord[] = [];
  const tricks: SimulationResult["tricks"] = [];
  const now = control.now ?? (() => performance.now());
  let steps = 0;
  while (state.lifecycle !== "complete") {
    if (control.cancelled?.())
      throw new SimulationFailure(
        "CANCELLED",
        "Simulation cancelled between canonical transitions",
      );
    if (++steps > 5000)
      throw new SimulationFailure("STEP_BOUND", `Step bound at ${state.progression.phase}`);
    if (state.progression.phase === "DEAL_RESULT" || state.progression.phase === "PHASE_RESULT") {
      const next = settleCanonicalLifecycle({ state, nextDealRandom: laterDealRandom, serverNow });
      if (!next.ok || !next.changed)
        throw new SimulationFailure("LIFECYCLE", `Lifecycle blocked at ${state.progression.phase}`);
      state = next.state;
      continue;
    }
    const seat = state.progression.currentActorSeat;
    if (seat == null)
      throw new SimulationFailure("NO_ACTION", `No actor at ${state.progression.phase}`);
    const projection = projectGameForSeat(state, seat);
    const started = now();
    const command = control.select
      ? control.select(projection)
      : (config.seatVersions?.[(seat - rotation + 4) % 4] ?? config.strategyVersion) ===
          COMPETITIVE_VERSION
        ? selectCompetitiveCommand(projection)?.command
        : selectBaselineGameplayCommand(projection)?.command;
    const latencyMs = Math.max(0, now() - started);
    if (!command)
      throw new SimulationFailure("NO_ACTION", `No action at ${state.progression.phase}`);
    const next = applyGameplayCommand({
      state,
      seat,
      command,
      serverNow,
      expectedController: "permanent_bot",
    });
    if (!next.ok)
      throw new SimulationFailure("REJECTED_ACTION", `Rejected ${command.type}: ${next.code}`);
    if (next.state.cards.completedTricks.length > state.cards.completedTricks.length) {
      const completed = next.state.cards.completedTricks.at(-1)!;
      tricks.push({
        dealNumber: state.progression.dealNumber,
        cards: completed.cards,
        winnerSeat: completed.winnerSeat,
      });
    }
    decisions.push({
      version: state.stateVersion,
      dealNumber: state.progression.dealNumber,
      seat,
      tier: physicalLineup[seat],
      phase: state.progression.phase,
      command,
      latencyMs,
    });
    state = next.state;
  }
  if (
    state.score.completedDeals?.length !== DEALS.length ||
    state.score.finalPlacements.some((value) => value == null)
  )
    throw new SimulationFailure("INVALID_RESULT", "Incomplete canonical result");
  return {
    config: { ...config, lineup: [...config.lineup] },
    selectedDealer,
    steps,
    physicalLineup,
    scores: [...state.score.cumulativeTotals],
    placements: state.score.finalPlacements as SimulationResult["placements"],
    deals: state.score.completedDeals,
    premia: state.score.roundPremia ?? [],
    decisions,
    tricks,
  };
}
