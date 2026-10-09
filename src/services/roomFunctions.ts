import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import type { Room } from "@/domain/players";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";
import { ensureInitialDealerBootstrapPrepared } from "@/server/dealerBootstrap";

const SESSION_COOKIE = "__Host-joker_session";

export type RoomFailureCode =
  | "NOT_AUTHENTICATED"
  | "NOT_HOST"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_ALREADY_STARTED"
  | "ACTIVE_GAME_EXISTS"
  | "ACTION_ID_CONFLICT"
  | "RULESET_NOT_IMPLEMENTED"
  | "INVALID_ROOM_STATE"
  | "BOT_NOT_FOUND"
  | "BOT_ALREADY_ASSIGNED"
  | "SEAT_NOT_EMPTY"
  | "BOT_ASSIGNMENT_NOT_ALLOWED"
  | "STALE_ROOM_VERSION"
  | "SERVICE_UNAVAILABLE";

export type RoomCommandResult =
  | { ok: true; room: Room; gameId?: string; replayed?: boolean }
  | {
      ok: false;
      code: RoomFailureCode;
      activeGame?: { gameId: string; roomCode: string };
    };

export type ActiveGameSummary = {
  gameId: string;
  roomCode: string;
  seatIndex: number;
  lifecycle: "starting" | "active";
  stateVersion: number;
};

export type CurrentActiveGameResult =
  | { ok: true; activeGame: ActiveGameSummary | null }
  | { ok: false; code: "NOT_AUTHENTICATED" | "SERVICE_UNAVAILABLE" };

type EdgePayload = RoomCommandResult | { ok?: false; code?: string };
type ActiveGameEdgePayload = CurrentActiveGameResult | { ok?: false; code?: string };

async function callRoomEdge(body: Record<string, unknown>): Promise<RoomCommandResult> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };

  try {
    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/room-commands`, {
      method: "POST",
      headers: {
        apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, sessionToken }),
    });

    const payload = (await response.json()) as EdgePayload;
    if (payload && typeof payload === "object" && "ok" in payload) {
      return payload as RoomCommandResult;
    }
  } catch {
    // Stable service error below.
  }

  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}

async function callActiveGameEdge(): Promise<CurrentActiveGameResult> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };

  try {
    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/room-commands`, {
      method: "POST",
      headers: {
        apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action: "active_game", sessionToken }),
    });

    const payload = (await response.json()) as ActiveGameEdgePayload;
    if (payload && typeof payload === "object" && "ok" in payload) {
      if (payload.ok === true) return payload;
      if (payload.code === "NOT_AUTHENTICATED") return { ok: false, code: "NOT_AUTHENTICATED" };
    }
  } catch {
    // Stable service error below.
  }

  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}

const roomCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/);
const actionId = z.string().uuid();
const roomVersion = z.number().int().nonnegative();
const seatIndex = z.number().int().min(0).max(3);
const botId = z.string().min(1).max(64);
const dialogueIntensity = z.enum(["conservative", "normal", "chaos"]);

export const getCurrentActiveGame = createServerFn({ method: "GET" }).handler(
  async (): Promise<CurrentActiveGameResult> => callActiveGameEdge(),
);

export const createProductionRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      actionId,
      rulesetId: z.enum(["popular", "classic", "minus", "panagiotis"]),
      botsTalk: z.boolean(),
      allowProfanity: z.boolean(),
      aiEnabled: z.boolean(),
      ttsEnabled: z.boolean(),
      showDialogueText: z.boolean(),
      intensity: dialogueIntensity,
    }),
  )
  .handler(async ({ data }) =>
    callRoomEdge({
      action: "create",
      actionId: data.actionId,
      rulesetId: data.rulesetId,
      botsTalk: data.botsTalk,
      allowProfanity: data.botsTalk && data.allowProfanity,
      aiEnabled: data.botsTalk && data.aiEnabled,
      ttsEnabled: data.botsTalk && data.ttsEnabled,
      showDialogueText: data.botsTalk && data.ttsEnabled ? data.showDialogueText : true,
      intensity: data.intensity,
    }),
  );

export const joinProductionRoom = createServerFn({ method: "POST" })
  .validator(z.object({ actionId, code: roomCode }))
  .handler(async ({ data }) => callRoomEdge({ action: "join", actionId: data.actionId, code: data.code }));

export const assignProductionBot = createServerFn({ method: "POST" })
  .validator(z.object({ actionId, code: roomCode, seatIndex, botId, expectedRoomVersion: roomVersion }))
  .handler(async ({ data }) =>
    callRoomEdge({
      action: "assign_bot",
      actionId: data.actionId,
      code: data.code,
      seatIndex: data.seatIndex,
      botId: data.botId,
      expectedRoomVersion: data.expectedRoomVersion,
    }),
  );

export const clearProductionBot = createServerFn({ method: "POST" })
  .validator(z.object({ actionId, code: roomCode, seatIndex, expectedRoomVersion: roomVersion }))
  .handler(async ({ data }) =>
    callRoomEdge({
      action: "clear_bot",
      actionId: data.actionId,
      code: data.code,
      seatIndex: data.seatIndex,
      expectedRoomVersion: data.expectedRoomVersion,
    }),
  );

export const replaceProductionBot = createServerFn({ method: "POST" })
  .validator(z.object({ actionId, code: roomCode, seatIndex, botId, expectedRoomVersion: roomVersion }))
  .handler(async ({ data }) =>
    callRoomEdge({
      action: "replace_bot",
      actionId: data.actionId,
      code: data.code,
      seatIndex: data.seatIndex,
      expectedRoomVersion: data.expectedRoomVersion,
      botId: data.botId,
    }),
  );

export const startProductionRoom = createServerFn({ method: "POST" })
  .validator(z.object({ actionId, code: roomCode, expectedRoomVersion: roomVersion }))
  .handler(async ({ data }): Promise<RoomCommandResult> => {
    const result = await callRoomEdge({
      action: "start",
      actionId: data.actionId,
      code: data.code,
      expectedRoomVersion: data.expectedRoomVersion,
    });
    if (!result.ok) return result;
    if (!result.gameId) return { ok: false, code: "INVALID_ROOM_STATE" };

    // Lobby Start prepares the canonical table only. Dealer resolution, deadlines
    // and automatic gameplay are forbidden until all humans are ready and host presses Play.
    const prepared = await ensureInitialDealerBootstrapPrepared(result.gameId);
    if (!prepared.ok) {
      if (prepared.code === "NOT_AUTHENTICATED") return { ok: false, code: "NOT_AUTHENTICATED" };
      if (prepared.code === "INVALID_CANONICAL_STATE") return { ok: false, code: "INVALID_ROOM_STATE" };
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }

    return result;
  });

export const getProductionRoom = createServerFn({ method: "GET" })
  .validator(z.object({ code: roomCode }))
  .handler(async ({ data }) => callRoomEdge({ action: "get", code: data.code }));

/** Options are derived from the verified server session, never the browser identity. */
export const getAvailableRulesets = createServerFn({ method: "GET" }).handler(async (): Promise<{ ok: true; options: import("@/domain/rulesetPresentation").RulesetOption[] } | { ok: false; code: string }> => {
 const sessionToken = getCookie(SESSION_COOKIE);
 if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
 try {
  const response = await fetch(EXTERNAL_SUPABASE_URL + "/functions/v1/room-commands", { method: "POST", headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ action: "ruleset_options", sessionToken }) });
  return await response.json();
 } catch { return { ok: false, code: "SERVICE_UNAVAILABLE" }; }
});

export type WaitingRoomSummary = { code: string; hostName: string; rulesetId: string; occupied: number; humans: number };
export type RoomMembership = { code: string; lifecycle: "lobby" | "playing"; gameId: string | null };
type LobbyLookupResult = { ok: true; rooms: WaitingRoomSummary[] } | { ok: false; code: string };
type MembershipResult = { ok: true; membership: RoomMembership | null } | { ok: false; code: string };
type LeaveWaitingResult = { ok: true; cancelled: boolean } | { ok: false; code: string };

async function callLobbyQuery(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
  try {
    const response = await fetch(EXTERNAL_SUPABASE_URL + "/functions/v1/room-commands", {
      method: "POST",
      headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sessionToken }),
    });
    const value: unknown = await response.json();
    if (value && typeof value === "object" && "ok" in value) return value as Record<string, unknown>;
  } catch { /* Normalized below. */ }
  return { ok: false, code: "SERVICE_UNAVAILABLE" };
}

export const listWaitingRooms = createServerFn({ method: "GET" }).handler(
  async (): Promise<LobbyLookupResult> => {
    const r = await callLobbyQuery({ action: "list_waiting" });
    return r['ok'] === true && Array.isArray(r['rooms'])
      ? { ok: true, rooms: r['rooms'] as WaitingRoomSummary[] }
      : { ok: false, code: String(r['code'] ?? "SERVICE_UNAVAILABLE") };
  },
);
export const getCurrentRoomMembership = createServerFn({ method: "GET" }).handler(
  async (): Promise<MembershipResult> => {
    const r = await callLobbyQuery({ action: "membership" });
    return r['ok'] === true
      ? { ok: true, membership: (r['membership'] ?? null) as RoomMembership | null }
      : { ok: false, code: String(r['code'] ?? "SERVICE_UNAVAILABLE") };
  },
);
export const leaveWaitingRoom = createServerFn({ method: "POST" })
  .validator(z.object({ code: roomCode }))
  .handler(async ({ data }): Promise<LeaveWaitingResult> => {
    const r = await callLobbyQuery({ action: "leave_waiting", code: data.code });
    return r['ok'] === true
      ? { ok: true, cancelled: r['cancelled'] === true }
      : { ok: false, code: String(r['code'] ?? "SERVICE_UNAVAILABLE") };
  });
