import { getCookie } from "@tanstack/react-start/server";

import {
  GAME_STATE_SCHEMA_VERSION,
  type CanonicalGameState,
} from "@/domain/gameState";
import type { SeatIndex } from "@/domain/dealing";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";
import { fingerprintJson } from "@/lib/stableFingerprint";

const SESSION_COOKIE = "__Host-joker_session";
const GAME_STATE_ENDPOINT = `${EXTERNAL_SUPABASE_URL}/functions/v1/game-state`;

export type GameStateFailureCode =
  | "NOT_AUTHENTICATED"
  | "GAME_NOT_FOUND"
  | "GAME_STATE_NOT_INITIALIZED"
  | "GAME_ALREADY_INITIALIZED"
  | "ACTION_ID_CONFLICT"
  | "STALE_STATE"
  | "INVALID_REQUEST"
  | "INVALID_CANONICAL_STATE"
  | "FINALIZATION_REQUIRED"
  | "SERVICE_UNAVAILABLE";

export type LoadGameStateResult =
  | {
      ok: true;
      gameId: string;
      roomId: string;
      viewerSeat: SeatIndex;
      rulesetId: "popular";
      rulesVersion: string;
      stateSchemaVersion: number;
      stateVersion: number;
      lifecycle: CanonicalGameState["lifecycle"];
      canonicalState: CanonicalGameState;
    }
  | { ok: false; code: GameStateFailureCode; stateVersion?: number };

export interface GameBootstrapParticipant {
  seat_index: number;
  owner_type: "human" | "bot";
  player_id: string | null;
  bot_id: string | null;
  bot_display_name: string | null;
  bot_personality_id: string | null;
  bot_strategy_profile_id: string | null;
  bot_catalog_version: string | null;
  status: string;
}

export type LoadGameBootstrapResult =
  | {
      ok: true;
      gameId: string;
      roomId: string;
      rulesetId: "popular";
      rulesVersion: string;
      stateSchemaVersion: number;
      stateVersion: number;
      lifecycle: CanonicalGameState["lifecycle"];
      participants: GameBootstrapParticipant[];
    }
  | { ok: false; code: GameStateFailureCode; stateVersion?: number };

export type PersistGameStateResult =
  | {
      ok: true;
      gameId: string;
      stateVersion: number;
      lifecycle: CanonicalGameState["lifecycle"];
      replayed: boolean;
    }
  | { ok: false; code: GameStateFailureCode; currentStateVersion?: number };

async function callGameStateEdge(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };

  try {
    const response = await fetch(GAME_STATE_ENDPOINT, {
      method: "POST",
      headers: {
        apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, sessionToken }),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    if (payload && typeof payload === "object" && "ok" in payload) return payload;
  } catch {
    // Stable service failure below.
  }
  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}

/** Server-only raw load. Never return its canonicalState directly from a route. */
export async function loadCanonicalGameState(gameId: string): Promise<LoadGameStateResult> {
  return (await callGameStateEdge({ action: "load", gameId })) as LoadGameStateResult;
}

/** Server-only roster/room metadata used only while canonical_state is still null. */
export async function loadGameBootstrap(gameId: string): Promise<LoadGameBootstrapResult> {
  return (await callGameStateEdge({ action: "bootstrap", gameId })) as LoadGameBootstrapResult;
}

/** Persist a TypeScript-computed transition through the single atomic Postgres CAS primitive. */
export async function persistCanonicalGameState(args: {
  gameId: string;
  actionId: string;
  commandType: string;
  expectedStateVersion: number;
  commandPayload: unknown;
  newState: CanonicalGameState;
}): Promise<PersistGameStateResult> {
  const { gameId, actionId, commandType, expectedStateVersion, commandPayload, newState } = args;

  if (newState.gameId !== gameId) throw new Error("Canonical state gameId mismatch before persistence");
  if (newState.stateSchemaVersion !== GAME_STATE_SCHEMA_VERSION) {
    throw new Error("Unsupported canonical state schema version");
  }
  if (newState.stateVersion !== expectedStateVersion + 1) {
    throw new Error("Canonical state version must be expectedStateVersion + 1");
  }
  if (!newState.initialDealerSelection) {
    throw new Error("Schema-v2 canonical state requires dealer-selection metadata");
  }

  const requestFingerprint = await fingerprintJson({
    gameId,
    commandType,
    expectedStateVersion,
    payload: commandPayload,
  });

  return (await callGameStateEdge({
    action: "persist",
    gameId,
    actionId,
    commandType,
    expectedStateVersion,
    requestFingerprint,
    newState,
  })) as PersistGameStateResult;
}
