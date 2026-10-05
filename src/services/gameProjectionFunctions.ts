import { RESTRICTED_HOST_ID } from "@/server/rulesetIdentity";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SeatIndex } from "@/domain/dealing";
import { projectGameForSeat, type PlayerGameProjection } from "@/domain/projection";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import { reclaimGameControl, type GameControlFailureCode } from "@/server/gameControl";
import {
  activateInitialDealAfterPresentation,
  ensureInitialDealerBootstrapPrepared,
  resolveInitialDealerBootstrap,
} from "@/server/dealerBootstrap";
import {
  authorizeGameStart,
  getGameTableReadiness,
  markStartPresentationComplete,
  setGameTableReady,
  type GameReadinessResult,
} from "@/server/gameReadiness";
import {
  submitHumanGameplayCommand,
  type SubmitGameplayCommandFailureCode,
} from "@/server/gameplayCommands";
import {
  loadCanonicalGameState,
  terminateCanonicalGameByHost,
  type GameStateFailureCode,
  type LoadGameStateResult,
} from "@/server/gamePersistence";
import { completeNineCardPresentation } from "@/server/nineCardPresentation";
import { advanceGameUntilBlocked } from "@/server/reconciliation";

export type ProjectedGameStateResult =
  { ok: true; projection: PlayerGameProjection } | { ok: false; code: GameStateFailureCode };

export type ReclaimGameControlResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: GameControlFailureCode; currentStateVersion?: number };

export type SubmitProjectedGameplayCommandResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: SubmitGameplayCommandFailureCode; currentStateVersion?: number };

export type TerminateProjectedGameResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: GameStateFailureCode; currentStateVersion?: number };

export type StartProjectedGameResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: GameStateFailureCode | "PLAYERS_NOT_READY" };

function isSeatIndex(value: number): value is SeatIndex {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

const suit = z.enum(["spades", "hearts", "diamonds", "clubs"]);
const jokerSemantic = z.discriminatedUnion("context", [
  z.object({ context: z.literal("OPEN_TRICK"), mode: z.enum(["COMPETE", "FROM_BELOW"]) }),
  z.object({
    context: z.literal("LEAD"),
    mode: z.enum(["HIGHER_SUIT", "SUIT_WINS"]),
    requestedSuit: suit,
  }),
]);
const gameplayCommand = z.discriminatedUnion("type", [
  z.object({ type: z.literal("declare"), value: z.number().int().min(0).max(9) }),
  z.object({ type: z.literal("choose_trump"), suit: suit.nullable() }),
  z.object({ type: z.literal("play_card"), cardId: z.string().min(1).max(64) }),
  z.object({ type: z.literal("choose_joker_semantic"), semantic: jokerSemantic }),
]);

async function ensureBootstrapIfNeeded(gameId: string): Promise<GameStateFailureCode | null> {
  const result = await ensureInitialDealerBootstrapPrepared(gameId);
  return result.ok ? null : result.code;
}

async function settleAutomaticState(gameId: string): Promise<LoadGameStateResult> {
  const reconciliation = await advanceGameUntilBlocked(gameId);
  if (!reconciliation.ok) {
    return reconciliation.currentStateVersion == null
      ? { ok: false, code: reconciliation.code }
      : { ok: false, code: reconciliation.code, stateVersion: reconciliation.currentStateVersion };
  }
  return loadCanonicalGameState(gameId);
}

function projected(loaded: Extract<LoadGameStateResult, { ok: true }>): PlayerGameProjection | null {
  if (!isSeatIndex(loaded.viewerSeat)) return null;
  return projectGameForSeat(
    loaded.canonicalState,
    loaded.viewerSeat,
    loaded.canonicalState.seats[loaded.viewerSeat].owner.type === "human" &&
      (loaded.canonicalState.seats[loaded.viewerSeat].owner as { playerId: string }).playerId === RESTRICTED_HOST_ID,
  );
}

export const getProjectedGameState = createServerFn({ method: "GET" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
    const bootstrapFailure = await ensureBootstrapIfNeeded(data.gameId);
    if (bootstrapFailure) return { ok: false, code: bootstrapFailure };
    const loaded = await settleAutomaticState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection ? { ok: true, projection } : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const getProjectedGameReadiness = createServerFn({ method: "GET" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<GameReadinessResult> => getGameTableReadiness(data.gameId));

export const setProjectedGameReady = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid(), ready: z.boolean() }))
  .handler(async ({ data }): Promise<GameReadinessResult> => setGameTableReady(data.gameId, data.ready));

export const startProjectedGame = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<StartProjectedGameResult> => {
    const authorization = await authorizeGameStart(data.gameId);
    if (!authorization.ok) return { ok: false, code: authorization.code };
    const resolved = await resolveInitialDealerBootstrap(data.gameId);
    if (!resolved.ok) return { ok: false, code: resolved.code };
    const loaded = await loadCanonicalGameState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection
      ? { ok: true, projection, replayed: resolved.replayed }
      : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const completeProjectedStartPresentation = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
    const marked = await markStartPresentationComplete(data.gameId);
    if (!marked.ok) return { ok: false, code: marked.code as GameStateFailureCode };
    if (marked.allPresented) {
      const activated = await activateInitialDealAfterPresentation(data.gameId);
      if (!activated.ok) return { ok: false, code: activated.code };
      const settled = await settleAutomaticState(data.gameId);
      if (!settled.ok) return { ok: false, code: settled.code };
      const projection = projected(settled);
      return projection ? { ok: true, projection } : { ok: false, code: "SERVICE_UNAVAILABLE" };
    }
    const loaded = await loadCanonicalGameState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection ? { ok: true, projection } : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const completeProjectedNineCardPresentation = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
    const completed = await completeNineCardPresentation(data.gameId);
    if (!completed.ok) return { ok: false, code: completed.code };
    // Do not reconcile again here. The released trump/declaration phase must be
    // observable before any bot can consume it on a later normal poll.
    const loaded = await loadCanonicalGameState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection ? { ok: true, projection } : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const reclaimProjectedGameControl = createServerFn({ method: "POST" })
  .validator(z.object({
    gameId: z.string().uuid(),
    actionId: z.string().uuid(),
    expectedStateVersion: z.number().int().nonnegative(),
  }))
  .handler(async ({ data }): Promise<ReclaimGameControlResult> => {
    const result = await reclaimGameControl(data);
    if (!result.ok) return result;
    const loaded = await settleAutomaticState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection
      ? { ok: true, replayed: result.replayed, projection }
      : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const submitProjectedGameplayCommand = createServerFn({ method: "POST" })
  .validator(z.object({
    gameId: z.string().uuid(),
    actionId: z.string().uuid(),
    expectedStateVersion: z.number().int().nonnegative(),
    command: gameplayCommand,
  }))
  .handler(async ({ data }): Promise<SubmitProjectedGameplayCommandResult> => {
    const result = await submitHumanGameplayCommand({
      gameId: data.gameId,
      actionId: data.actionId,
      expectedStateVersion: data.expectedStateVersion,
      command: data.command as GameplayCommand,
    });
    if (!result.ok) return result;
    const loaded = await settleAutomaticState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    const projection = projected(loaded);
    return projection
      ? { ok: true, replayed: result.replayed, projection }
      : { ok: false, code: "SERVICE_UNAVAILABLE" };
  });

export const terminateProjectedGame = createServerFn({ method: "POST" })
  .validator(z.object({
    gameId: z.string().uuid(),
    actionId: z.string().uuid(),
    expectedStateVersion: z.number().int().nonnegative(),
  }))
  .handler(async ({ data }): Promise<TerminateProjectedGameResult> => {
    const result = await terminateCanonicalGameByHost(data);
    if (!result.ok) return result;

    const terminal = result as typeof result & {
      canonicalState: Extract<LoadGameStateResult, { ok: true }>["canonicalState"];
      viewerSeat: number;
    };
    if (!isSeatIndex(terminal.viewerSeat) || !terminal.canonicalState) {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }

    const owner = terminal.canonicalState.seats[terminal.viewerSeat]?.owner;
    const projection = projectGameForSeat(
      terminal.canonicalState,
      terminal.viewerSeat,
      owner?.type === "human" && owner.playerId === RESTRICTED_HOST_ID,
    );
    return { ok: true, replayed: result.replayed, projection };
  });
