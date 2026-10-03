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
    case "NOT_HOST":
      return 403;
    case "ROOM_NOT_FOUND":
      return 404;
    case "ROOM_FULL":
    case "ROOM_ALREADY_STARTED":
    case "ACTIVE_GAME_EXISTS":
    case "ACTION_ID_CONFLICT":
      return 409;
    case "RULESET_NOT_IMPLEMENTED":
    case "INVALID_ROOM_STATE":
      return 400;
    default:
      return 400;
  }
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
        rpcName = "create_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_ruleset_id: String(body?.rulesetId ?? ""),
          p_bots_talk: Boolean(body?.botsTalk),
          p_allow_profanity: Boolean(body?.allowProfanity),
        };
      } else if (action === "join") {
        rpcName = "join_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: String(body?.code ?? ""),
        };
      } else if (action === "start") {
        rpcName = "start_room_internal";
        args = {
          p_session_token: sessionToken,
          p_action_id: actionId,
          p_code: String(body?.code ?? ""),
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

    const result = (data ?? { ok: false, code: "SERVICE_UNAVAILABLE" }) as Record<string, unknown>;
    return json(
      result,
      result.ok === true ? 200 : statusFor(typeof result.code === "string" ? result.code : undefined),
    );
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
