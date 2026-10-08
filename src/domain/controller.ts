import type { SeatIndex } from "./dealing";
import type { GameplayCommand } from "./gameplayCommands";
import type { CanonicalGameState } from "./gameState";
import { projectGameForSeat, type PlayerGameProjection } from "./projection";

/** Deterministically selects one tier from private canonical server entropy, once per takeover. */
function chooseTemporaryStrategy(state: CanonicalGameState, actor: SeatIndex, serverNow: string): "strong-basic-v1" | "memory-inference-v1" | "probability-simulation-v1" {
  const entropy = `${state.serverEntropySeed ?? ""}|${state.gameId}|${state.stateVersion}|${actor}|${serverNow}`;
  let hash = 2166136261;
  for (let i = 0; i < entropy.length; i += 1) {
    hash = Math.imul(hash ^ entropy.charCodeAt(i), 16777619);
  }
  const tiers = ["strong-basic-v1", "memory-inference-v1", "probability-simulation-v1"] as const;
  return tiers[(hash >>> 0) % tiers.length]!;
}

export const HUMAN_TURN_TIMEOUT_MS = 30_000;
export const MAX_SYNCHRONOUS_BOT_STEPS = 32;
export const PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET = 1;

export type ControlTransitionResult =
  | { ok: true; changed: false; state: CanonicalGameState }
  | { ok: true; changed: true; state: CanonicalGameState }
  | { ok: false; code: "RECLAIM_NOT_AVAILABLE" | "INVALID_SERVER_TIME" };

function parseServerTime(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function humanOwnedSeatCount(state: CanonicalGameState): number {
  return state.seats.reduce((count, seat) => count + (seat.owner.type === "human" ? 1 : 0), 0);
}

export function isSoloHumanPaused(state: CanonicalGameState, seatIndex: SeatIndex): boolean {
  const seat = state.seats[seatIndex];
  return state.lifecycle === "active" &&
    humanOwnedSeatCount(state) <= 1 &&
    state.progression.currentActorSeat === seatIndex &&
    seat.owner.type === "human" &&
    seat.controller === "human" &&
    seat.reclaimable &&
    state.timing.currentHumanDeadline == null &&
    !state.timing.timeoutTakeoverActive;
}

export function humanDeadlineFromServerTime(serverNow: string): string {
  const now = parseServerTime(serverNow);
  if (now == null) throw new Error("Invalid server time");
  return new Date(now + HUMAN_TURN_TIMEOUT_MS).toISOString();
}

export function isHumanDeadlineOverdue(state: CanonicalGameState, serverNow: string): boolean {
  const now = parseServerTime(serverNow);
  if (now == null) return false;
  const deadline = state.timing.currentHumanDeadline;
  if (!deadline) return false;
  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(deadlineMs) && deadlineMs <= now;
}

export function applyOverdueTimeout(
  state: CanonicalGameState,
  serverNow: string,
): ControlTransitionResult {
  if (parseServerTime(serverNow) == null) return { ok: false, code: "INVALID_SERVER_TIME" };
  if (state.timing.turnPresentation || state.lifecycle !== "active" || !isHumanDeadlineOverdue(state, serverNow)) {
    return { ok: true, changed: false, state };
  }

  const actor = state.progression.currentActorSeat;
  if (actor == null) return { ok: true, changed: false, state };
  const seat = state.seats[actor];
  if (seat.owner.type !== "human" || seat.controller !== "human") {
    return { ok: true, changed: false, state };
  }

  const seats = state.seats.map((item) => ({ ...item })) as CanonicalGameState["seats"];

  if (humanOwnedSeatCount(state) <= 1) {
    seats[actor] = {
      ...seats[actor],
      controller: "human",
      takeoverAt: serverNow,
      reclaimable: true,
    };
    return {
      ok: true,
      changed: true,
      state: {
        ...state,
        stateVersion: state.stateVersion + 1,
        seats,
        timing: {
          currentHumanDeadline: null,
          timeoutTakeoverActive: false,
        },
      },
    };
  }

  seats[actor] = {
    ...seats[actor],
    controller: "temporary_bot",
    takeoverAt: serverNow,
    temporaryBotStrategyProfileId: chooseTemporaryStrategy(state, actor, serverNow),
    reclaimable: true,
  };

  return {
    ok: true,
    changed: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      seats,
      timing: {
        currentHumanDeadline: null,
        timeoutTakeoverActive: true,
      },
    },
  };
}

export function applyReclaimControl(
  state: CanonicalGameState,
  seatIndex: SeatIndex,
  serverNow: string,
): ControlTransitionResult {
  if (parseServerTime(serverNow) == null) return { ok: false, code: "INVALID_SERVER_TIME" };
  const seat = state.seats[seatIndex];
  const temporaryBotReclaim = seat.owner.type === "human" && seat.controller === "temporary_bot" && seat.reclaimable;
  const soloPauseReclaim = isSoloHumanPaused(state, seatIndex);
  if (state.lifecycle !== "active" || (!temporaryBotReclaim && !soloPauseReclaim)) {
    return { ok: false, code: "RECLAIM_NOT_AVAILABLE" };
  }

  const seats = state.seats.map((item) => ({ ...item })) as CanonicalGameState["seats"];
  seats[seatIndex] = {
    ...seats[seatIndex],
    controller: "human",
    takeoverAt: null,
    reclaimable: false,
  };
  delete seats[seatIndex].temporaryBotStrategyProfileId;

  return {
    ok: true,
    changed: true,
    state: {
      ...state,
      stateVersion: state.stateVersion + 1,
      seats,
      timing: {
        ...state.timing,
        currentHumanDeadline:
          state.timing.turnPresentation ? null : state.progression.currentActorSeat === seatIndex
            ? humanDeadlineFromServerTime(serverNow)
            : state.timing.currentHumanDeadline,
        timeoutTakeoverActive: false,
      },
    },
  };
}

export interface BotProgressionAdapter {
  selectAction(view: PlayerGameProjection): GameplayCommand | null;
  applyAction(args: {
    state: CanonicalGameState;
    seat: SeatIndex;
    action: GameplayCommand;
  }): CanonicalGameState;
}

export interface BotProgressionResult {
  state: CanonicalGameState;
  steps: number;
  stopReason: "HUMAN_INPUT" | "NO_ACTOR" | "NO_LEGAL_ACTION" | "GAME_COMPLETE" | "STEP_BOUND";
}

export function runBoundedBotProgression(
  initial: CanonicalGameState,
  adapter: BotProgressionAdapter,
  maxSteps = MAX_SYNCHRONOUS_BOT_STEPS,
): BotProgressionResult {
  if (!Number.isInteger(maxSteps) || maxSteps < 1) throw new Error("maxSteps must be a positive integer");
  let state = initial;

  for (let steps = 0; steps < maxSteps; steps += 1) {
    if (state.lifecycle === "complete") return { state, steps, stopReason: "GAME_COMPLETE" };
    const actor = state.progression.currentActorSeat;
    if (actor == null) return { state, steps, stopReason: "NO_ACTOR" };
    if (state.seats[actor].controller === "human") {
      return { state, steps, stopReason: "HUMAN_INPUT" };
    }

    const view = projectGameForSeat(state, actor);
    const action = adapter.selectAction(view);
    if (!action) return { state, steps, stopReason: "NO_LEGAL_ACTION" };
    const next = adapter.applyAction({ state, seat: actor, action });
    if (next === state || next.stateVersion <= state.stateVersion) {
      throw new Error("Bot transition must advance canonical state version");
    }
    state = next;
  }

  return { state, steps: maxSteps, stopReason: "STEP_BOUND" };
}
