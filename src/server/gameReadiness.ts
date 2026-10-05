import { getCookie } from "@tanstack/react-start/server";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";

const SESSION_COOKIE = "__Host-joker_session";
const GAME_STATE_ENDPOINT = `${EXTERNAL_SUPABASE_URL}/functions/v1/game-state`;

export type GameReadinessHuman = {
  playerId: string;
  seatIndex: number;
  ready: boolean;
  presentationComplete: boolean;
};

export type GameReadinessSnapshot = {
  ok: true;
  gameId: string;
  viewerPlayerId: string;
  isHost: boolean;
  lifecycle: "starting" | "active" | "complete";
  phase: string;
  allReady: boolean;
  allPresented: boolean;
  humans: GameReadinessHuman[];
};

export type GameReadinessFailure = {
  ok: false;
  code:
    | "NOT_AUTHENTICATED"
    | "NOT_HOST"
    | "GAME_NOT_FOUND"
    | "GAME_NOT_ACTIVE"
    | "PLAYERS_NOT_READY"
    | "SERVICE_UNAVAILABLE";
};

export type GameReadinessResult = GameReadinessSnapshot | GameReadinessFailure;
export type GameStartAuthorizationResult =
  | { ok: true; gameId: string; authorized: true }
  | GameReadinessFailure;
export type PresentationCompletionResult =
  | { ok: true; gameId: string; allPresented: boolean }
  | GameReadinessFailure;

async function call(action: string, gameId: string, extra: Record<string, unknown> = {}) {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" } as const;
  try {
    const response = await fetch(GAME_STATE_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, gameId, sessionToken, ...extra }),
    });
    const payload = await response.json();
    if (payload && typeof payload === "object" && "ok" in payload) return payload;
  } catch {
    // Stable failure below.
  }
  return { ok: false, code: "SERVICE_UNAVAILABLE" } as const;
}

export async function getGameTableReadiness(gameId: string): Promise<GameReadinessResult> {
  return await call("readiness", gameId) as GameReadinessResult;
}

export async function setGameTableReady(gameId: string, ready: boolean): Promise<GameReadinessResult> {
  return await call("set_ready", gameId, { ready }) as GameReadinessResult;
}

export async function authorizeGameStart(gameId: string): Promise<GameStartAuthorizationResult> {
  return await call("authorize_start", gameId) as GameStartAuthorizationResult;
}

export async function markStartPresentationComplete(gameId: string): Promise<PresentationCompletionResult> {
  return await call("presentation_complete", gameId) as PresentationCompletionResult;
}
