import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  BOT_CATALOG_VERSION,
  CANONICAL_BOTS,
  deterministicBotOrder,
  getCanonicalBot,
  publicBotCatalog,
} from "../_shared/bot-catalog.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function statusFor(code?: string) {
  switch (code) {
    case "NOT_AUTHENTICATED":
      return 401;
    case "NOT_HOST":
      return 403;
    case "ROOM_NOT_FOUND":
    case "BOT_NOT_FOUND":
      return 404;
    case "ROOM_FULL":
    case "ROOM_ALREADY_STARTED":
    case "ACTIVE_GAME_EXISTS":
    case "ACTION_ID_CONFLICT":
    case "BOT_ALREADY_ASSIGNED":
    case "SEAT_NOT_EMPTY":
    case "STALE_ROOM_VERSION":
      return 409;
    case "RULESET_NOT_IMPLEMENTED":
    case "INVALID_ROOM_STATE":
    case "BOT_ASSIGNMENT_NOT_ALLOWED":
      return 400;
    default:
      return 400;
  }
}

type JsonRecord = Record<string, unknown>;

type DialogueIntensity = "conservative" | "normal" | "chaos";

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function dialogueIntensity(value: unknown): DialogueIntensity | null {
  return value === "conservative" || value === "normal" || value === "chaos" ? value : null;
}

function decorateRoomResult(result: JsonRecord): JsonRecord {
  if (result.ok !== true || !result.room || typeof result.room !== "object") return result;

  const room = result.room as JsonRecord;
  const seats = Array.isArray(room.seats) ? room.seats : [];
  const usedBotIds: string[] = [];

  for (const seat of seats) {
    if (!seat || typeof seat !== "object") continue;
    const occupant = (seat as JsonRecord).occupant;
    if (!occupant || typeof occupant !== "object") continue;
    const occupantRecord = occupant as JsonRecord;
    if (occupantRecord.type !== "bot" || !occupantRecord.bot || typeof occupantRecord.bot !== "object") {
      continue;
    }
    const botId = (occupantRecord.bot as JsonRecord).id;
    if (typeof botId === "string") usedBotIds.push(botId);
  }

  return {
    ...result,
    room: {
      ...room,
      botCatalogVersion:
        typeof room.botCatalogVersion === "string" ? room.botCatalogVersion : BOT_CATALOG_VERSION,
      botCatalog: publicBotCatalog(usedBotIds),
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);

  try {
    const body = await req.json();
    const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
    if (!/^[0-9a-f]{64}$/i.test(sessionToken)) {
      return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const action = typeof body?.action === "string" ? body.action : "";
    let rpcName = "";
    let args: Record<string, unknown> = {};

    if (action === "get") {
      rpcName = "get_room_for_session_internal";
      args = { p_session_token: sessionToken, p_code: String(body?.code ?? "") };
    } else {
      const actionId = typeof body?.actionId === "string" ? body.actionId : "";
      if (!/^[0-9a-f-]{36}$/i.test(actionId)) {
        return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      }

      if (action === "create") {
        const intensity = dialogueIntensity(body?.intensity);
        const botsTalk = Boolean(body?.botsTalk);
        const allowProfanity = Boolean(body?.allowProfanity);
        const aiEnabled = Boolean(body?.aiEnabled);
        if (!intensity || ((!botsTalk) && (allowProfanity || aiEnabled))) {
          return json({ ok: false, code: "INVALID_ROOM_STATE" }, 400);
        }

        rpcName = "create_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_ruleset_id: String(body?.rulesetId ?? ""),
          p_bots_talk: botsTalk,
          p_allow_profanity: botsTalk && allowProfanity,
          p_ai_enabled: botsTalk && aiEnabled,
          p_dialogue_intensity: intensity,
        };
      } else if (action === "join") {
        rpcName = "join_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: String(body?.code ?? ""),
        };
      } else if (action === "assign_bot" || action === "replace_bot") {
        const expectedRoomVersion = integer(body?.expectedRoomVersion);
        const seatIndex = integer(body?.seatIndex);
        const bot = getCanonicalBot(typeof body?.botId === "string" ? body.botId : "");
        if (expectedRoomVersion === null || seatIndex === null || seatIndex > 3) {
          return json({ ok: false, code: "INVALID_REQUEST" }, 400);
        }
        if (!bot) return json({ ok: false, code: "BOT_NOT_FOUND" }, 404);

        rpcName = action === "assign_bot" ? "assign_bot_to_seat_internal" : "replace_bot_seat_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: String(body?.code ?? ""),
          p_seat_index: seatIndex,
          p_expected_room_version: expectedRoomVersion,
          p_bot_id: bot.id,
          p_bot_display_name: bot.displayName,
          p_bot_avatar_url: bot.avatarUrl,
          p_bot_personality_id: bot.personalityId,
          p_bot_strategy_profile_id: bot.strategyProfileId,
          p_bot_catalog_version: bot.catalogVersion,
        };
      } else if (action === "clear_bot") {
        const expectedRoomVersion = integer(body?.expectedRoomVersion);
        const seatIndex = integer(body?.seatIndex);
        if (expectedRoomVersion === null || seatIndex === null || seatIndex > 3) {
          return json({ ok: false, code: "INVALID_REQUEST" }, 400);
        }

        rpcName = "clear_bot_seat_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: String(body?.code ?? ""),
          p_seat_index: seatIndex,
          p_expected_room_version: expectedRoomVersion,
        };
      } else if (action === "start") {
        const expectedRoomVersion = integer(body?.expectedRoomVersion);
        const code = String(body?.code ?? "");
        if (expectedRoomVersion === null) {
          return json({ ok: false, code: "INVALID_REQUEST" }, 400);
        }

        const orderedCatalog = deterministicBotOrder({
          roomCode: code,
          actionId,
          expectedRoomVersion,
        });

        rpcName = "start_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: code,
          p_expected_room_version: expectedRoomVersion,
          p_ordered_bot_catalog: orderedCatalog,
        };
      } else {
        return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      }
    }

    const { data, error } = await admin.rpc(rpcName, args);
    if (error) {
      console.error("room-command-rpc-failed", { action, code: error.code });
      return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    }

    const raw = (data ?? { ok: false, code: "SERVICE_UNAVAILABLE" }) as JsonRecord;
    const result = decorateRoomResult(raw);
    return json(
      result,
      result.ok === true ? 200 : statusFor(typeof result.code === "string" ? result.code : undefined),
    );
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});

// Keep the canonical roster referenced in this module so deployment bundlers include
// the shared catalog even when only command subsets are exercised at runtime.
void CANONICAL_BOTS;
