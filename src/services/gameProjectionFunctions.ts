import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SeatIndex } from "@/domain/dealing";
import { projectGameForSeat, type PlayerGameProjection } from "@/domain/projection";
import {
  reclaimGameControl,
  resolveOverdueTimeoutBeforeRead,
  type GameControlFailureCode,
} from "@/server/gameControl";
import type { GameStateFailureCode } from "@/server/gamePersistence";

export type ProjectedGameStateResult =
  | { ok: true; projection: PlayerGameProjection }
  | { ok: false; code: GameStateFailureCode };

export type ReclaimGameControlResult =
  | { ok: true; projection: PlayerGameProjection; replayed: boolean }
  | { ok: false; code: GameControlFailureCode; currentStateVersion?: number };

function isSeatIndex(value: number): value is SeatIndex {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export const getProjectedGameState = createServerFn({ method: "GET" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
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
