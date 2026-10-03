import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { SeatIndex } from "@/domain/dealing";
import { projectGameForSeat, type PlayerGameProjection } from "@/domain/projection";
import {
  loadCanonicalGameState,
  type GameStateFailureCode,
} from "@/server/gamePersistence";

export type ProjectedGameStateResult =
  | { ok: true; projection: PlayerGameProjection }
  | { ok: false; code: GameStateFailureCode };

function isSeatIndex(value: number): value is SeatIndex {
  return Number.isInteger(value) && value >= 0 && value <= 3;
}

export const getProjectedGameState = createServerFn({ method: "GET" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ProjectedGameStateResult> => {
    const loaded = await loadCanonicalGameState(data.gameId);
    if (!loaded.ok) return { ok: false, code: loaded.code };

    if (!isSeatIndex(loaded.viewerSeat)) {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }

    return {
      ok: true,
      projection: projectGameForSeat(loaded.canonicalState, loaded.viewerSeat),
    };
  });
