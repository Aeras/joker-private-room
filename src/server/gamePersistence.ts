import { assertRulesetState } from "@/domain/rulesetValidation";
import type { RulesetId, RulesVersion } from "@/domain/rulesets";
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
  | "NOT_HOST"
  | "GAME_NOT_FOUND"
  | "GAME_NOT_ACTIVE"
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
      rulesetId: RulesetId;
      rulesVersion: RulesVersion;
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
      rulesetId: RulesetId;
      rulesVersion: RulesVersion;
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

export type TerminateGameResult =
  | {
      ok: true;
      gameId: string;
      stateVersion: number;
      lifecycle: "complete";
      terminationReason: "host_ended";
      replayed: boolean;
    }
  | { ok: false; code: GameStateFailureCode; currentStateVersion?: number };

export interface CompletedGameParticipant {
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
  rulesVersion: RulesVersion;
  participants: CompletedGameParticipant[];
}

export interface ObjectivePlacementStats {
  totalGames: number;
  firstPlaceCount: number;
  secondPlaceCount: number;
  thirdPlaceCount: number;
  fourthPlaceCount: number;
  winPercentage: null;
}

export interface BotPlacementStats extends ObjectivePlacementStats {
  botId: string;
  displayName: string;
}

export type GameHistoryResult =
  | { ok: true; history: CompletedGameSummary[]; stats: ObjectivePlacementStats; botStats: BotPlacementStats[] }
  | { ok: false; code: GameStateFailureCode };

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

export async function loadCanonicalGameState(gameId: string): Promise<LoadGameStateResult> {
  const result = (await callGameStateEdge({ action: "load", gameId })) as LoadGameStateResult;
  if (result.ok) {
    try { assertRulesetState(result.canonicalState); }
    catch { return { ok: false, code: "INVALID_CANONICAL_STATE" }; }
  }
  return result;
}

export async function loadGameBootstrap(gameId: string): Promise<LoadGameBootstrapResult> {
  return (await callGameStateEdge({ action: "bootstrap", gameId })) as LoadGameBootstrapResult;
}

export async function loadCompletedGameHistory(limit = 50): Promise<GameHistoryResult> {
  return (await callGameStateEdge({ action: "history", limit })) as GameHistoryResult;
}

function assertPersistableState(gameId: string, expectedStateVersion: number, newState: CanonicalGameState) {
  if (newState.gameId !== gameId) throw new Error("Canonical state gameId mismatch before persistence");
  assertRulesetState(newState);
  if (newState.stateSchemaVersion !== GAME_STATE_SCHEMA_VERSION && newState.stateSchemaVersion !== 3) throw new Error("Unsupported canonical state schema version");
  if (newState.stateVersion !== expectedStateVersion + 1) throw new Error("Canonical state version must be expectedStateVersion + 1");
  if (!newState.initialDealerSelection) throw new Error("Canonical state requires dealer-selection metadata");
  if (!newState.serverEntropySeed || !/^[0-9a-f]{64}$/i.test(newState.serverEntropySeed)) throw new Error("Canonical state requires private server entropy");
  if (!Array.isArray(newState.score.completedDeals) || !Array.isArray(newState.score.roundPremia)) throw new Error("Canonical state requires authoritative score history");
}

export async function persistCanonicalGameState(args: {
  gameId: string;
  actionId: string;
  commandType: string;
  expectedStateVersion: number;
  commandPayload: unknown;
  newState: CanonicalGameState;
}): Promise<PersistGameStateResult> {
  const { gameId, actionId, commandType, expectedStateVersion, commandPayload, newState } = args;
  assertPersistableState(gameId, expectedStateVersion, newState);
  const requestFingerprint = await fingerprintJson({ gameId, commandType, expectedStateVersion, payload: commandPayload });
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

export async function finalizeCanonicalGameState(args: {
  gameId: string;
  actionId: string;
  expectedStateVersion: number;
  newState: CanonicalGameState;
}): Promise<PersistGameStateResult> {
  const { gameId, actionId, expectedStateVersion, newState } = args;
  assertPersistableState(gameId, expectedStateVersion, newState);
  if (newState.lifecycle !== "complete" || newState.progression.phase !== "GAME_COMPLETE") throw new Error("Finalization requires GAME_COMPLETE canonical state");
  if (newState.score.finalPlacements.some((value) => value == null)) throw new Error("Finalization requires all placements");

  const commandType = "finalize_game";
  const requestFingerprint = await fingerprintJson({
    gameId,
    commandType,
    expectedStateVersion,
    totals: newState.score.cumulativeTotals,
    placements: newState.score.finalPlacements,
  });
  return (await callGameStateEdge({
    action: "finalize",
    gameId,
    actionId,
    commandType,
    expectedStateVersion,
    requestFingerprint,
    newState,
  })) as PersistGameStateResult;
}

export async function terminateCanonicalGameByHost(args: {
  gameId: string;
  actionId: string;
  expectedStateVersion: number;
}): Promise<TerminateGameResult> {
  const commandType = "host_end_game";
  const requestFingerprint = await fingerprintJson({
    gameId: args.gameId,
    commandType,
    expectedStateVersion: args.expectedStateVersion,
  });
  return (await callGameStateEdge({
    action: "terminate",
    gameId: args.gameId,
    actionId: args.actionId,
    commandType,
    expectedStateVersion: args.expectedStateVersion,
    requestFingerprint,
  })) as TerminateGameResult;
}
