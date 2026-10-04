import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function statusFor(code?: string) {
  switch (code) {
    case "NOT_AUTHENTICATED": return 401;
    case "NOT_HOST": return 403;
    case "GAME_NOT_FOUND": return 404;
    case "ACTION_ID_CONFLICT":
    case "STALE_STATE":
    case "GAME_ALREADY_INITIALIZED":
    case "GAME_NOT_ACTIVE": return 409;
    case "GAME_STATE_NOT_INITIALIZED":
    case "INVALID_REQUEST":
    case "INVALID_CANONICAL_STATE":
    case "FINALIZATION_REQUIRED": return 400;
    default: return 400;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionPattern = /^[0-9a-f]{64}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/i;
const commandPattern = /^[a-z0-9_]{1,64}$/;

async function bootstrapGame(admin: ReturnType<typeof createClient>, sessionToken: string, gameId: string) {
  const { data: viewerRows, error: viewerError } = await admin.rpc("validate_player_session_internal", { p_session_token: sessionToken });
  if (viewerError) throw viewerError;
  const viewerId = Array.isArray(viewerRows) ? viewerRows[0]?.id : null;
  if (typeof viewerId !== "string") return { ok: false, code: "NOT_AUTHENTICATED" };

  const { data: participants, error: participantError } = await admin
    .from("game_participants")
    .select("seat_index,owner_type,player_id,bot_id,bot_display_name,bot_personality_id,bot_strategy_profile_id,bot_catalog_version,status")
    .eq("game_id", gameId)
    .eq("status", "active")
    .order("seat_index", { ascending: true });
  if (participantError) throw participantError;
  if (!Array.isArray(participants) || participants.length !== 4) return { ok: false, code: "GAME_NOT_FOUND" };
  if (!participants.some((p) => p.owner_type === "human" && p.player_id === viewerId)) return { ok: false, code: "GAME_NOT_FOUND" };

  const { data: game, error: gameError } = await admin
    .from("games")
    .select("id,room_id,ruleset_id,rules_version,state_schema_version,state_version,lifecycle,canonical_state")
    .eq("id", gameId)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!game) return { ok: false, code: "GAME_NOT_FOUND" };
  if (game.canonical_state != null) return { ok: false, code: "GAME_ALREADY_INITIALIZED", stateVersion: game.state_version };
  if (game.state_version !== 0 || game.lifecycle !== "starting") return { ok: false, code: "INVALID_CANONICAL_STATE" };

  const { data: prepared, error: prepareError } = await admin
    .from("games")
    .update({ state_schema_version: 4 })
    .eq("id", gameId)
    .eq("state_version", 0)
    .is("canonical_state", null)
    .select("id,room_id,ruleset_id,rules_version,state_schema_version,state_version,lifecycle")
    .maybeSingle();
  if (prepareError) throw prepareError;
  if (!prepared) return { ok: false, code: "GAME_ALREADY_INITIALIZED" };

  return {
    ok: true,
    gameId: prepared.id,
    roomId: prepared.room_id,
    rulesetId: prepared.ruleset_id,
    rulesVersion: prepared.rules_version,
    stateSchemaVersion: prepared.state_schema_version,
    stateVersion: prepared.state_version,
    lifecycle: prepared.lifecycle,
    participants,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);

  try {
    const body = await req.json();
    const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
    const action = typeof body?.action === "string" ? body.action : "";
    if (!sessionPattern.test(sessionToken)) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (action === "history") {
      const rawLimit = Number.isInteger(body?.limit) ? body.limit : 50;
      const limit = Math.max(1, Math.min(100, rawLimit));
      const { data, error } = await admin.rpc("get_game_history_internal", {
        p_session_token: sessionToken,
        p_limit: limit,
      });
      if (error) {
        console.error("game-history-rpc-failed", { code: error.code });
        return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      }
      const result = data ?? { ok: false, code: "SERVICE_UNAVAILABLE" };
      return json(result, result.ok === true ? 200 : statusFor(result.code));
    }

    const gameId = typeof body?.gameId === "string" ? body.gameId : "";
    if (!uuidPattern.test(gameId)) return json({ ok: false, code: "INVALID_REQUEST" }, 400);

    if (action === "bootstrap") {
      const result = await bootstrapGame(admin, sessionToken, gameId);
      return json(result, result.ok === true ? 200 : statusFor(typeof result.code === "string" ? result.code : undefined));
    }

    let rpcName: string;
    let args: Record<string, unknown>;

    if (action === "load") {
      rpcName = "load_game_state_internal";
      args = { p_session_token: sessionToken, p_game_id: gameId };
    } else if (action === "terminate") {
      const actionId = typeof body?.actionId === "string" ? body.actionId : "";
      const commandType = typeof body?.commandType === "string" ? body.commandType : "";
      const fingerprint = typeof body?.requestFingerprint === "string" ? body.requestFingerprint : "";
      const expectedStateVersion = body?.expectedStateVersion;
      if (
        !uuidPattern.test(actionId) ||
        commandType !== "host_end_game" ||
        !fingerprintPattern.test(fingerprint) ||
        !Number.isSafeInteger(expectedStateVersion) ||
        expectedStateVersion < 0
      ) return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      rpcName = "terminate_game_by_host_internal";
      args = {
        p_session_token: sessionToken,
        p_game_id: gameId,
        p_action_id: actionId,
        p_expected_state_version: expectedStateVersion,
        p_request_fingerprint: fingerprint.toLowerCase(),
      };
    } else if (action === "persist" || action === "finalize") {
      const actionId = typeof body?.actionId === "string" ? body.actionId : "";
      const commandType = typeof body?.commandType === "string" ? body.commandType : "";
      const fingerprint = typeof body?.requestFingerprint === "string" ? body.requestFingerprint : "";
      const expectedStateVersion = body?.expectedStateVersion;
      const newState = body?.newState;

      if (
        !uuidPattern.test(actionId) ||
        !commandPattern.test(commandType) ||
        !fingerprintPattern.test(fingerprint) ||
        !Number.isSafeInteger(expectedStateVersion) ||
        expectedStateVersion < 0 ||
        newState == null ||
        typeof newState !== "object" ||
        Array.isArray(newState)
      ) return json({ ok: false, code: "INVALID_REQUEST" }, 400);

      if (action === "finalize") {
        if (commandType !== "finalize_game") return json({ ok: false, code: "INVALID_REQUEST" }, 400);
        rpcName = "finalize_game_internal";
        args = {
          p_session_token: sessionToken,
          p_game_id: gameId,
          p_action_id: actionId,
          p_expected_state_version: expectedStateVersion,
          p_request_fingerprint: fingerprint.toLowerCase(),
          p_new_state: newState,
        };
      } else {
        rpcName = "persist_game_state_internal";
        args = {
          p_session_token: sessionToken,
          p_game_id: gameId,
          p_action_id: actionId,
          p_command_type: commandType,
          p_expected_state_version: expectedStateVersion,
          p_request_fingerprint: fingerprint.toLowerCase(),
          p_new_state: newState,
        };
      }
    } else {
      return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    }

    const { data, error } = await admin.rpc(rpcName, args);
    if (error) {
      console.error("game-state-rpc-failed", { action, code: error.code });
      return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    }
    const result = data ?? { ok: false, code: "SERVICE_UNAVAILABLE" };
    return json(result, result.ok === true ? 200 : statusFor(result.code));
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
