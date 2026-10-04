import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function sourceKey(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Invalid request" }, 405);

  try {
    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (action === "validate") {
      const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
      if (!/^[0-9a-f]{64}$/i.test(sessionToken)) return json({ error: "Invalid session" }, 401);

      const { data, error } = await admin.rpc("validate_player_session_internal", {
        p_session_token: sessionToken,
      });
      if (error || !data?.length) return json({ error: "Invalid session" }, 401);
      const p = data[0];
      return json({
        player: { id: p.id, displayName: p.display_name, role: p.is_host ? "host" : "player" },
        expiresAt: p.expires_at,
      });
    }

    if (action === "revoke") {
      const sessionToken = typeof body?.sessionToken === "string" ? body.sessionToken : "";
      if (!/^[0-9a-f]{64}$/i.test(sessionToken)) return json({ ok: true });
      await admin.rpc("revoke_player_session_internal", { p_session_token: sessionToken });
      return json({ ok: true });
    }

    if (action !== "authenticate") return json({ error: "Invalid request" }, 400);

    const playerId = typeof body?.playerId === "string" ? body.playerId : "";
    const pin = typeof body?.pin === "string" ? body.pin : "";
    const currentSessionToken = typeof body?.currentSessionToken === "string" ? body.currentSessionToken : null;
    if (!playerId || !/^\d{4}$/.test(pin)) {
      return json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" }, 400);
    }

    const { data, error } = await admin.rpc("authenticate_player_pin_internal", {
      p_player_id: playerId,
      p_pin: pin,
      p_source: sourceKey(req),
      p_current_session_token: currentSessionToken,
    });
    if (error || !data?.length) {
      return json({ error: "Service unavailable", code: "SERVICE_UNAVAILABLE" }, 503);
    }

    const result = data[0];
    if (result.result_code === "PIN_COOLDOWN_ACTIVE") {
      return json({
        error: "Try again later",
        code: "PIN_COOLDOWN_ACTIVE",
        retryAfterSeconds: result.retry_after_seconds ?? null,
      }, 429);
    }
    if (result.result_code === "SECOND_ACTIVE_CONNECTION") {
      return json({ error: "Active session already exists", code: "SECOND_ACTIVE_CONNECTION" }, 409);
    }
    if (result.result_code !== "OK") {
      return json({
        error: "Invalid credentials",
        code: "INVALID_CREDENTIALS",
        retryAfterSeconds: result.retry_after_seconds ?? null,
      }, 401);
    }

    return json({
      player: {
        id: result.out_player_id,
        displayName: result.out_display_name,
        role: result.out_is_host ? "host" : "player",
      },
      sessionToken: result.session_token ?? null,
      reuseSession: Boolean(result.reuse_session),
      retryAfterSeconds: result.retry_after_seconds ?? null,
    });
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
});
