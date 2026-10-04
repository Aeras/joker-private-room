import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { GameHistoryResult } from "@/server/gameHistory";

export const getPrivateGameHistory = createServerFn({ method: "GET" })
  .validator(z.object({ limit: z.number().int().min(1).max(100).default(50) }))
  .handler(async ({ data }): Promise<GameHistoryResult> => {
    const { loadPrivateGameHistory } = await import("@/server/gameHistory");
    return loadPrivateGameHistory(data.limit);
  });
