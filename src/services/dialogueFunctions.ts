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
  source: "preset" | "xai";
  replyDepth: 0 | 1;
  createdAt: string;
  expiresAt: string;
  audioContent?: string | null;
  audioMimeType?: "audio/mpeg" | null;
  ttsVoiceName?: string | null;
}

export type DialogueEdgeResult =
  | {
      ok: true;
      messages?: DialogueMessage[];
      message?: DialogueMessage;
      text?: string | null;
      source?: "preset" | "xai" | "silence";
      providerAttempted?: boolean;
      providerReason?: string;
    }
  | { ok: false; code: string };

const gameId = z.string().uuid();
const botId = z.string().min(1).max(64);
const dialogueEventId = z.string().min(1).max(128).regex(/^state-\d+:[A-Z0-9_]+:(?:all|[0-3]):\d+$/);

async function callDialogueEdge(body: Record<string, unknown>): Promise<DialogueEdgeResult> {
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
    const payload = (await response.json()) as DialogueEdgeResult;
    return payload?.ok === true
      ? payload
      : { ok: false, code: payload && "code" in payload ? String(payload.code) : "SERVICE_UNAVAILABLE" };
  } catch {
    return { ok: false, code: "SERVICE_UNAVAILABLE" };
  }
}

export const getDialogueMessages = createServerFn({ method: "GET" })
  .validator(z.object({ gameId }))
  .handler(async ({ data }): Promise<{ ok: true; messages: DialogueMessage[] } | { ok: false; code: string }> => {
    const payload = await callDialogueEdge({ action: "list", gameId: data.gameId });
    if (!payload.ok) return payload;
    return { ok: true, messages: payload.messages ?? [] };
  });

export const requestDialogueReaction = createServerFn({ method: "POST" })
  .validator(z.object({ gameId, eventId: dialogueEventId }))
  .handler(async ({ data }): Promise<DialogueEdgeResult> =>
    callDialogueEdge({ action: "generate-state", gameId: data.gameId, eventId: data.eventId }),
  );

export const requestBotDialogueReply = createServerFn({ method: "POST" })
  .validator(
    z.object({
      gameId,
      sourceMessageId: z.string().uuid(),
      responderBotId: botId,
    }),
  )
  .handler(async ({ data }): Promise<DialogueEdgeResult> =>
    callDialogueEdge({
      action: "bot-reply",
      gameId: data.gameId,
      sourceMessageId: data.sourceMessageId,
      responderBotId: data.responderBotId,
    }),
  );

export const sendHumanMessageToBot = createServerFn({ method: "POST" })
  .validator(
    z.object({
      gameId,
      actionId: z.string().uuid(),
      speakerBotId: botId,
      text: z.string().trim().min(1).max(160),
    }),
  )
  .handler(async ({ data }): Promise<DialogueEdgeResult> =>
    callDialogueEdge({
      action: "human-message",
      gameId: data.gameId,
      actionId: data.actionId,
      speakerBotId: data.speakerBotId,
      text: data.text,
    }),
  );
