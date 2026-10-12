import { createServerFn } from "@tanstack/react-start";
import { getCookie, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/external-supabase/client";
import type { CapabilityResult } from "./realtime/protocol";
export const getRealtimeCapability = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid() }).strict())
  .handler(async ({ data }): Promise<CapabilityResult> => {
    setResponseHeader("Cache-Control", "no-store");
    if (process.env["JOKER_REALTIME_ENABLED"] !== "true") return { ok: false, code: "DISABLED" };
    const sessionToken = getCookie("__Host-joker_session");
    if (!sessionToken || !/^[0-9a-f]{64}$/i.test(sessionToken))
      return { ok: false, code: "NOT_AUTHENTICATED" };
    try {
      const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/game-state`, {
        method: "POST",
        headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "realtime_capability", gameId: data.gameId, sessionToken }),
        signal: AbortSignal.timeout(10_000),
      });
      const result = (await response.json()) as CapabilityResult;
      if (result.ok && response.ok) return result;
      if (!result.ok && ["DISABLED", "NOT_MEMBER", "NOT_AUTHENTICATED"].includes(result.code))
        return result;
    } catch {
      /* Fail closed; keep projection polling. */
    }
    return { ok: false, code: "UNAVAILABLE" };
  });
