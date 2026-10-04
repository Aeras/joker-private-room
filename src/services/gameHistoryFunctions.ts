import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadCompletedGameHistory, type GameHistoryResult } from "@/server/gamePersistence";

export const getCompletedGameHistory = createServerFn({ method: "GET" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
  .handler(async ({ data }): Promise<GameHistoryResult> => loadCompletedGameHistory(data.limit));
