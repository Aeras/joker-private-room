import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
} from "@/integrations/external-supabase/client";
export interface TableMessage {
  id: string;
  fromSeat: number;
  to: number | "all";
  text: string;
  createdAt: string;
  expiresAt: string;
}
export type TableMessageResult =
  { ok: true; serverNow: string; messages: TableMessage[] } | { ok: false; code: string };
async function callMessages(body: Record<string, unknown>): Promise<TableMessageResult> {
  const sessionToken = getCookie("__Host-joker_session");
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
  try {
    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/table-messages`, {
      method: "POST",
      headers: { apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, sessionToken }),
      cache: "no-store",
    });
    const payload = (await response.json()) as TableMessageResult;
    return response.ok && payload.ok
      ? payload
      : { ok: false, code: !payload.ok ? payload.code : "SERVICE_UNAVAILABLE" };
  } catch {
    return { ok: false, code: "SERVICE_UNAVAILABLE" };
  }
}
export const getTableMessages = createServerFn({ method: "POST" })
  .validator(z.object({ gameId: z.string().uuid() }))
  .handler(({ data }) => callMessages({ ...data, action: "list" }));
export const sendTableMessage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      gameId: z.string().uuid(),
      messageId: z.string().uuid(),
      to: z.union([z.literal("all"), z.number().int().min(0).max(3)]),
      text: z.string().trim().min(1).max(80),
    }),
  )
  .handler(({ data }) => callMessages({ ...data, action: "send" }));
