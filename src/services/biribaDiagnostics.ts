import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_PUBLISHABLE_KEY } from "@/integrations/external-supabase/client";

const schema = z.object({
  action: z.enum(["status", "ingest", "list", "export", "purge", "toggle"]),
  code: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
  roomId: z.string().uuid().optional(),
  payload: z.unknown().optional(),
});

export type DebugMatch = {
  roomId: string; code: string | null; first_event: string; last_event: string;
  eventCount: number; playerCount: number; warningCount: number; players: string[];
};
export type DebugEvent = {
  id: number; player: string; playerId: string; sessionKey: string; at: string;
  kind: string; details: { t?: number; data?: Record<string, unknown> };
};
export type DebugResponse =
  | { ok: true; enabled?: boolean; isAdmin?: boolean; matches?: DebugMatch[]; events?: DebugEvent[]; accepted?: number; limit?: boolean }
  | { ok: false; code: string };

export const biribaDiagnostics = createServerFn({ method: "POST" })
  .validator(schema)
  .handler(async ({ data }): Promise<DebugResponse> => {
    const token = getCookie("__Host-joker_session");
    if (!token) return { ok: false, code: "NOT_AUTHENTICATED" };
    try {
      const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/biriba-commands`, {
        method: "POST",
        headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ action: `diag_${data.action}`, code: data.code, roomId: data.roomId, payload: data.payload, sessionToken: token }),
      });
      const result = await response.json() as DebugResponse;
      return typeof result?.ok === "boolean" ? result : { ok: false, code: "SERVICE_UNAVAILABLE" };
    } catch {
      return { ok: false, code: "SERVICE_UNAVAILABLE" };
    }
  });
