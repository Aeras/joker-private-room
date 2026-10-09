import { createClient } from "jsr:@supabase/supabase-js@2.117.3";
import { validateLabJobConfig } from "@/server/botLab/jobModel.ts";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ code: "INVALID_REQUEST" }, 405);
  try {
    const text = await request.text();
    if (text.length > 4096) return json({ code: "INVALID_REQUEST" }, 400);
    const body = JSON.parse(text),
      action = body.action,
      payload = body.payload ?? {};
    if (typeof body.sessionToken !== "string" || !/^[0-9a-f]{64}$/i.test(body.sessionToken))
      return json({ code: "ADMIN_REQUIRED" }, 403);
    if (!["access", "list", "create", "get", "cancel", "results", "stats"].includes(action))
      return json({ code: "INVALID_REQUEST" }, 400);
    if (action === "create") {
      validateLabJobConfig(payload.config);
      if (!uuid.test(payload.requestId ?? "")) return json({ code: "INVALID_REQUEST" }, 400);
    }
    if (["get", "cancel", "results", "stats"].includes(action) && !uuid.test(payload.jobId ?? ""))
      return json({ code: "INVALID_REQUEST" }, 400);
    if (
      action === "results" &&
      (!Number.isInteger(payload.offset ?? 0) ||
        (payload.offset ?? 0) < 0 ||
        (payload.offset ?? 0) > 10000)
    )
      return json({ code: "INVALID_REQUEST" }, 400);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data, error } =
      action === "stats"
        ? await admin.rpc("bot_lab_stats_internal", {
            p_session_token: body.sessionToken,
            p_job_id: payload.jobId,
          })
        : await admin.rpc("bot_lab_admin_internal", {
            p_session_token: body.sessionToken,
            p_action: action,
            p_payload: payload,
          });
    if (error) {
      const code =
        [
          "ADMIN_REQUIRED",
          "WORKER_NOT_CONFIGURED",
          "INVALID_CONFIG",
          "ACTION_ID_CONFLICT",
          "JOB_NOT_FOUND",
        ].find((c) => error.message.includes(c)) ??
        (error.code === "23505" ? "JOB_ALREADY_ACTIVE" : "SERVICE_UNAVAILABLE");
      return json(
        { code },
        code === "ADMIN_REQUIRED"
          ? 403
          : code === "INVALID_CONFIG"
            ? 400
            : code === "JOB_ALREADY_ACTIVE"
              ? 409
              : 503,
      );
    }
    return json({ data });
  } catch {
    return json({ code: "INVALID_REQUEST" }, 400);
  }
});
