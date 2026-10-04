import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SeatIndex } from "@/domain/dealing";
import { projectGameForSeat, type PlayerGameProjection } from "@/domain/projection";
import type { GameplayCommand } from "@/domain/gameplayCommands";
import {
  reclaimGameControl,
  resolveOverdueTimeoutBeforeRead,
  type GameControlFailureCode,
} from "@/server/gameControl";
import { ensureInitialDealerBootstrap } from "@/server/dealerBootstrap";
import {
  submitHumanGameplayCommand,
  type SubmitGameplayCommandFailureCode,
} from "@/server/gameplayCommands";
import type { GameStateFailureCode } from "@/server/gamePersistence";

export type ProjectedGameStateResult =
  | { ok: true; projection: PlayerGameProjection }
  | { ok: false; code: GameStateFailureCode };

export type ReclaimGameControlResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: GameControlFailureCode; currentStateVersion?: number };

export type SubmitProjectedGameplayCommandResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: SubmitGameplayCommandFailureCode; currentStateVersion?: number };

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
  const result = await ensureInitialDealerBootstrap(gameId);
  return result.ok ? null : result.code;
}

export const getProjectedGameState = createServerFn({ method: "GET" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
    const bootstrapFailure = await ensureBootstrapIfNeeded(data.gameId);
    if (bootstrapFailure) return { ok: false, code: bootstrapFailure };

    const loaded = await resolveOverdueTimeoutBeforeRead(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };

    if (!isSeatIndex(loaded.viewerSeat)) {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }

    return {
      ok: true,
      projection: projectGameForSeat(loaded.canonicalState, loaded.viewerSeat),
    };
  });

export const reclaimProjectedGameControl = createServerFn({ method: "POST" })
  .validator(
    z.object({
      gameId: z.string().uuid(),
      actionId: z.string().uuid(),
      expectedStateVersion: z.number().int().nonnegative(),
    }),
  )
  .handler(async ({ data }): Promise<ReclaimGameControlResult> => {
    const result = await reclaimGameControl(data);
    if (!result.ok) return result;

    const loaded = await resolveOverdueTimeoutBeforeRead(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    if (!isSeatIndex(loaded.viewerSeat)) return { ok: false, code: "SERVICE_UNAVAILABLE" };

    return {
      ok: true,
      replayed: result.replayed,
      projection: projectGameForSeat(loaded.canonicalState, loaded.viewerSeat),
    };
  });

export const submitProjectedGameplayCommand = createServerFn({ method: "POST" })
  .validator(
    z.object({
      gameId: z.string().uuid(),
      actionId: z.string().uuid(),
      expectedStateVersion: z.number().int().nonnegative(),
      command: gameplayCommand,
    }),
  )
  .handler(async ({ data }): Promise<SubmitProjectedGameplayCommandResult> => {
    const result = await submitHumanGameplayCommand({
      gameId: data.gameId,
      actionId: data.actionId,
      expectedStateVersion: data.expectedStateVersion,
      command: data.command as GameplayCommand,
    });
    if (!result.ok) return result;

    const loaded = await resolveOverdueTimeoutBeforeRead(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };
    if (!isSeatIndex(loaded.viewerSeat)) return { ok: false, code: "SERVICE_UNAVAILABLE" };

    return {
      ok: true,
      replayed: result.replayed,
      projection: projectGameForSeat(loaded.canonicalState, loaded.viewerSeat),
    };
  });
