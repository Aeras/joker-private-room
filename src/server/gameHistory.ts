import { getCookie } from "@tanstack/react-start/server";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";
import type { GameStateFailureCode } from "./gamePersistence";

const SESSION_COOKIE = "__Host-joker_session";

export interface CompletedParticipantSummary {
  seatIndex: number;
  ownerType: "human" | "bot";
  playerId?: string;
  playerDisplayName?: string;
  botId?: string;
  botDisplayName?: string;
  botAvatarUrl?: string;
  botStrategyProfileId?: string;
  botCatalogVersion?: string;
  finalScore: number;
  finalPlacement: number;
}

export interface CompletedGameSummary {
  gameId: string;
  completedAt: string;
  rulesetId: string;
  rulesVersion: string;
  participants: CompletedParticipantSummary[];
}

export interface PlacementStats {
  totalGames: number;
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
  fourthPlaceCount: number;
  /** Intentionally null until Product resolves shared-first numerator semantics. */
  winPercentage: null;
}

export interface BotPlacementStats extends PlacementStats {
  botId: string;
  displayName: string;
}

export type GameHistoryResult =
  | { ok: true; history: CompletedGameSummary[]; stats: PlacementStats; botStats: BotPlacementStats[] }
  | { ok: false; code: GameStateFailureCode };

export async function loadPrivateGameHistory(limit = 50): Promise<GameHistoryResult> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
  try {
    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/game-state`, {
      method: "POST",
      headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "history", sessionToken, limit }),
    });
    const payload = (await response.json()) as GameHistoryResult;
    if (payload && typeof payload === "object" && "ok" in payload) return payload;
  } catch {
    // Stable failure below.
  }
  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}
