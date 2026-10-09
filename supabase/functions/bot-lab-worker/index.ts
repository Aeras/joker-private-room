import { createClient } from "jsr:@supabase/supabase-js@2.117.3";
import { runLabWorkerChunk, type LabClaim } from "@/server/botLab/worker.ts";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return json({ code: "INVALID_REQUEST" }, 405);
  try {
    const text = await request.text();
    if (text.length > 256) return json({ code: "INVALID_REQUEST" }, 400);
    const body = JSON.parse(text);
    if (
      typeof body.invocationToken !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        body.invocationToken,
      )
    )
      return json({ code: "INVALID_REQUEST" }, 400);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const result = await runLabWorkerChunk(
      {
        claim: async (token) => {
          const { data, error } = await admin.rpc("claim_bot_lab_internal", {
            p_invocation_token: token,
          });
          if (error) throw Error(error.code === "42501" ? "WORKER_DENIED" : "WORKER_UNAVAILABLE");
          return data as LabClaim | null;
        },
        commit: async (i) => {
          const { data, error } = await admin.rpc("commit_bot_lab_chunk_internal", {
            p_job_id: i.jobId,
            p_lease_token: i.leaseToken,
            p_game_index: i.gameIndex,
            p_checkpoint: i.checkpoint,
            p_result: i.result,
            p_error: i.error,
          });
          if (error) throw Error("WORKER_UNAVAILABLE");
          return data === true;
        },
      },
      body.invocationToken,
    );
    return json(result);
  } catch (error) {
    return json(
      {
        code:
          error instanceof Error && error.message === "WORKER_DENIED"
            ? "WORKER_DENIED"
            : "WORKER_UNAVAILABLE",
      },
      error instanceof Error && error.message === "WORKER_DENIED" ? 403 : 503,
    );
  }
});
