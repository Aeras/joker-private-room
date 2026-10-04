import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import type { Room } from "@/domain/players";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";
import { ensureCanonicalGameInitialized } from "@/server/gameInitialization";

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

type EdgePayload = RoomCommandResult | { ok?: false; code?: string };

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

const roomCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4}$/);
const actionId = z.string().uuid();
const roomVersion = z.number().int().nonnegative();
const seatIndex = z.number().int().min(0).max(3);
const botId = z.string().min(1).max(64);

export const createProductionRoom = createServerFn({ method: "POST" })
  .validator(
    z.object({
      actionId,
      rulesetId: z.enum(["popular", "classic", "panagiotis"]),
      botsTalk: z.boolean(),
      allowProfanity: z.boolean(),
    }),
  )
  .handler(async ({ data }) =>
    callRoomEdge({
      action: "create",
      actionId: data.actionId,
      rulesetId: data.rulesetId,
      botsTalk: data.botsTalk,
      allowProfanity: data.allowProfanity,
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
      botId: data.botId,
      expectedRoomVersion: data.expectedRoomVersion,
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

    const initialized = await ensureCanonicalGameInitialized(result.gameId);
    if (!initialized.ok) {
      if (initialized.code === "NOT_AUTHENTICATED") return { ok: false, code: "NOT_AUTHENTICATED" };
      if (initialized.code === "INVALID_CANONICAL_STATE") return { ok: false, code: "INVALID_ROOM_STATE" };
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }

    return result;
  });

export const getProductionRoom = createServerFn({ method: "GET" })
  .validator(z.object({ code: roomCode }))
  .handler(async ({ data }) => callRoomEdge({ action: "get", code: data.code }));
