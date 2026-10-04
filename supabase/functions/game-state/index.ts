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
    case "NOT_AUTHENTICATED":
      return 401;
    case "GAME_NOT_FOUND":
      return 404;
    case "ACTION_ID_CONFLICT":
    case "STALE_STATE":
      return 409;
    case "GAME_STATE_NOT_INITIALIZED":
    case "INVALID_REQUEST":
    case "INVALID_CANONICAL_STATE":
    case "FINALIZATION_REQUIRED":
      return 400;
    default:
      return 400;
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sessionPattern = /^[0-9a-f]{64}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/i;
const commandPattern = /^[a-z0-9_]{1,64}$/;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);

  try {
    const body = await req.json();
    const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
    const gameId = typeof body?.gameId === "string" ? body.gameId : "";

    if (!sessionPattern.test(sessionToken)) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);
    if (!uuidPattern.test(gameId)) return json({ ok: false, code: "INVALID_REQUEST" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const action = typeof body?.action === "string" ? body.action : "";
    let rpcName: string;
    let args: Record<string, unknown>;

    if (action === "load") {
      rpcName = "load_game_state_internal";
      args = { p_session_token: sessionToken, p_game_id: gameId };
    } else if (action === "persist") {
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
      ) {
        return json({ ok: false, code: "INVALID_REQUEST" }, 400);
      }

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
    } else {
      return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    }

    const { data, error } = await admin.rpc(rpcName, args);
    if (error) {
      console.error("game-state-rpc-failed", { action, code: error.code });
      return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    }

    const result = (data ?? { ok: false, code: "SERVICE_UNAVAILABLE" }) as Record<string, unknown>;
    return json(
      result,
      result.ok === true ? 200 : statusFor(typeof result.code === "string" ? result.code : undefined),
    );
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
