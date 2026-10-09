import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";

const request = z.object({
  action: z.enum(["access", "list", "create", "get", "cancel", "results", "stats"]),
  payload: z.record(z.string(), z.unknown()).optional(),
});
/** Only the server reads the HttpOnly PIN session. Every action is authorized
 * again by the database using the immutable administrator UUID. */
export const botLabRequest = createServerFn({ method: "POST" })
  .validator(request)
  .handler(async ({ data }): Promise<{ ok: true; json: string } | { ok: false; code: string }> => {
    const sessionToken = getCookie("__Host-joker_session");
    if (!sessionToken) return { ok: false, code: "ADMIN_REQUIRED" };
    try {
      const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/bot-lab`, {
        method: "POST",
        headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, sessionToken }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      return response.ok
        ? { ok: true, json: JSON.stringify(result.data) }
        : {
            ok: false,
            code: typeof result.code === "string" ? result.code : "SERVICE_UNAVAILABLE",
          };
    } catch {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }
  });
