import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);
  try {
    const body = await request.json();
    if (typeof body.sessionToken !== "string" || !/^[0-9a-f]{64}$/i.test(body.sessionToken))
      return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);
    if (
      typeof body.gameId !== "string" ||
      !uuid.test(body.gameId) ||
      !["list", "send"].includes(body.action)
    )
      return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    if (
      body.action === "send" &&
      (typeof body.messageId !== "string" ||
        !uuid.test(body.messageId) ||
        typeof body.text !== "string" ||
        (body.to !== "all" && (!Number.isInteger(body.to) || body.to < 0 || body.to > 3)))
    )
      return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } = await admin.rpc("ephemeral_table_messages_internal", {
      p_session_token: body.sessionToken,
      p_game_id: body.gameId,
      p_action: body.action,
      ...(body.action === "send"
        ? {
            p_message_id: body.messageId,
            p_target_seat: body.to === "all" ? null : body.to,
            p_text: body.text,
          }
        : {}),
    });
    if (error || !data) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    return json(
      data,
      data.ok
        ? 200
        : data.code === "NOT_AUTHENTICATED"
          ? 401
          : data.code === "NOT_AUTHORIZED"
            ? 403
            : data.code === "RATE_LIMITED"
              ? 429
              : 400,
    );
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
