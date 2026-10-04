import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
  EXTERNAL_SUPABASE_URL,
} from "@/integrations/external-supabase/client";

const SESSION_COOKIE = "__Host-joker_session";

export interface DialogueMessage {
  id: string;
  eventId: string;
  speakerBotId: string;
  targetSeat: number | null;
  text: string;
  source: "preset" | "gemini";
  replyDepth: 0 | 1;
  createdAt: string;
  expiresAt: string;
}

const gameId = z.string().uuid();
const botId = z.string().min(1).max(64);
const event = z.object({
  id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  createdAt: z.string().datetime(),
  speakerBotId: botId,
  targetName: z.string().max(40).optional(),
  targetSeat: z.number().int().min(0).max(3).optional(),
  declared: z.number().int().min(0).max(9).optional(),
  actualTricks: z.number().int().min(0).max(9).optional(),
  scoreDelta: z.number().int().min(-1000).max(1000).optional(),
  round: z.number().int().min(1).max(4).optional(),
  deal: z.number().int().min(1).max(24).optional(),
  publicSummary: z.string().max(160).optional(),
  humanMessage: z.string().max(160).optional(),
  replyDepth: z.union([z.literal(0), z.literal(1)]),
});

async function callDialogueEdge(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sessionToken = getCookie(SESSION_COOKIE);
  if (!sessionToken) return { ok: false, code: "NOT_AUTHENTICATED" };
  try {
    const response = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/ai-banter`, {
      method: "POST",
      headers: {
        apikey: EXTERNAL_SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, sessionToken }),
    });
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return { ok: false, code: "SERVICE_UNAVAILABLE" };
  }
}

export const getDialogueMessages = createServerFn({ method: "GET" })
  .validator(z.object({ gameId }))
  .handler(async ({ data }): Promise<{ ok: true; messages: DialogueMessage[] } | { ok: false; code: string }> => {
    const payload = await callDialogueEdge({ action: "list", gameId: data.gameId });
    if (payload.ok !== true) return { ok: false, code: String(payload.code ?? "SERVICE_UNAVAILABLE") };
    return { ok: true, messages: Array.isArray(payload.messages) ? (payload.messages as DialogueMessage[]) : [] };
  });

export const requestDialogueReaction = createServerFn({ method: "POST" })
  .validator(z.object({ gameId, event }))
  .handler(async ({ data }) => callDialogueEdge({ action: "generate", gameId: data.gameId, event: data.event }));

export const sendHumanMessageToBot = createServerFn({ method: "POST" })
  .validator(z.object({ gameId, actionId: z.string().uuid(), speakerBotId: botId, text: z.string().trim().min(1).max(160) }))
  .handler(async ({ data }) =>
    callDialogueEdge({
      action: "generate",
      gameId: data.gameId,
      event: {
        id: `human:${data.actionId}`,
        type: "HUMAN_MESSAGE_TO_BOT",
        createdAt: new Date().toISOString(),
        speakerBotId: data.speakerBotId,
        humanMessage: data.text,
        replyDepth: 0,
      },
    }),
  );
