import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getDialoguePersonality,
  type DialogueGenerationContext,
  type DialogueEventType,
  type PublicDialogueEvent,
} from "../_shared/dialogue-core.ts";
import { generateDialogueLine } from "../_shared/gemini-dialogue.ts";
import { getCanonicalBot } from "../_shared/bot-catalog.ts";

const DIALOGUE_EVENT_TYPES = new Set<DialogueEventType>([
  "PLAYER_DECLARED_ZERO",
  "PLAYER_DECLARED_HIGH",
  "PLAYER_HIT_EXACT_BID",
  "PLAYER_MISSED_BID",
  "BOT_HIT_EXACT_BID",
  "BOT_MISSED_BID",
  "BOT_GOT_MINUS_200",
  "PLAYER_GOT_MINUS_200",
  "PLAYER_STOLE_CRITICAL_TRICK",
  "BOT_STOLE_CRITICAL_TRICK",
  "JOKER_PLAYED",
  "JOKER_CHANGED_TRICK_RESULT",
  "FORCED_TRUMP",
  "OVERTRICK",
  "UNDERTRICK",
  "PREMIA_ACHIEVED",
  "PREMIA_LOST",
  "COMEBACK",
  "SCORE_COLLAPSE",
  "BOT_REVENGE_SUCCESS",
  "ROUND_END",
  "GAME_END",
  "HUMAN_MESSAGE_TO_BOT",
  "BOT_MESSAGE_TO_BOT",
]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDialogueEventType(value: unknown): value is DialogueEventType {
  return typeof value === "string" && DIALOGUE_EVENT_TYPES.has(value as DialogueEventType);
}

function hasStableEventIdentity(id: string, type: DialogueEventType): boolean {
  if (type === "HUMAN_MESSAGE_TO_BOT") return /^human:[0-9a-f-]{36}$/i.test(id);
  if (type === "BOT_MESSAGE_TO_BOT") return /^reply:[^:]{1,128}:[a-z0-9-]{1,64}$/i.test(id);
  return /^state-\d+:[A-Z0-9_]+:(?:\d|all):\d+$/.test(id);
}

function publicEvent(value: unknown): PublicDialogueEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const speakerBotId = typeof event.speakerBotId === "string" ? event.speakerBotId : "";
  if (!getCanonicalBot(speakerBotId)) return null;
  if (typeof event.id !== "string" || event.id.length < 1 || event.id.length > 128) return null;
  if (!isDialogueEventType(event.type) || !hasStableEventIdentity(event.id, event.type)) return null;
  if (typeof event.createdAt !== "string" || Number.isNaN(Date.parse(event.createdAt))) return null;
  const replyDepth = event.replyDepth === 0 || event.replyDepth === 1 ? event.replyDepth : null;
  if (replyDepth === null) return null;
  if (event.type === "HUMAN_MESSAGE_TO_BOT" && replyDepth !== 0) return null;
  if (event.type === "BOT_MESSAGE_TO_BOT" && replyDepth !== 1) return null;

  return {
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    speakerBotId: speakerBotId as PublicDialogueEvent["speakerBotId"],
    ...(typeof event.targetName === "string" ? { targetName: event.targetName.slice(0, 40) } : {}),
    ...(typeof event.targetSeat === "number" && Number.isInteger(event.targetSeat) && event.targetSeat >= 0 && event.targetSeat <= 3
      ? { targetSeat: event.targetSeat }
      : {}),
    ...(typeof event.declared === "number" ? { declared: event.declared } : {}),
    ...(typeof event.actualTricks === "number" ? { actualTricks: event.actualTricks } : {}),
    ...(typeof event.scoreDelta === "number" ? { scoreDelta: event.scoreDelta } : {}),
    ...(typeof event.round === "number" ? { round: event.round } : {}),
    ...(typeof event.deal === "number" ? { deal: event.deal } : {}),
    ...(typeof event.publicSummary === "string" ? { publicSummary: event.publicSummary.slice(0, 160) } : {}),
    ...(typeof event.humanMessage === "string" ? { humanMessage: event.humanMessage.slice(0, 160) } : {}),
    replyDepth,
  };
}

function recentLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).text : null))
    .filter((text): text is string => typeof text === "string")
    .slice(-3)
    .map((text) => text.slice(0, 100));
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);

  try {
    const body = await req.json();
    if (!isSessionToken(body?.sessionToken) || !isUuid(body?.gameId)) {
      return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    if (body?.action === "list") {
      const { data, error } = await admin.rpc("list_dialogue_messages_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
      });
      if (error) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      return json(data ?? { ok: false, code: "SERVICE_UNAVAILABLE" }, data?.ok === true ? 200 : 404);
    }

    if (body?.action !== "generate") return json({ ok: false, code: "INVALID_REQUEST" }, 400);

    const event = publicEvent(body?.event);
    if (!event) return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);

    const bot = getCanonicalBot(event.speakerBotId);
    const personality = bot ? getDialoguePersonality(bot.personalityId) : null;
    if (!bot || !personality) return json({ ok: false, code: "INVALID_DIALOGUE_TARGET" }, 400);

    const [{ data: policyData, error: policyError }, { data: recentData, error: recentError }] = await Promise.all([
      admin.rpc("get_dialogue_policy_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
      }),
      admin.rpc("list_dialogue_messages_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
      }),
    ]);
    if (policyError || recentError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);

    const policy = policyData?.policy as Record<string, unknown> | undefined;
    if (policyData?.ok !== true || !policy) {
      return json(policyData ?? { ok: false, code: "GAME_NOT_FOUND" }, 404);
    }
    if (policy.speechEnabled !== true) return json({ ok: false, code: "DIALOGUE_DISABLED" }, 409);

    const providerCall = policy.aiEnabled === true;
    const { data: claim, error: claimError } = await admin.rpc("claim_dialogue_event_internal", {
      p_session_token: body.sessionToken,
      p_game_id: body.gameId,
      p_event_id: event.id,
      p_event_type: event.type,
      p_speaker_bot_id: event.speakerBotId,
      p_reply_depth: event.replyDepth,
      p_is_human_message: event.type === "HUMAN_MESSAGE_TO_BOT",
      p_event_created_at: event.createdAt,
      p_provider_call: providerCall,
    });
    if (claimError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    if (claim?.ok !== true) return json(claim, 409);

    const context: DialogueGenerationContext = {
      botId: bot.id,
      botDisplayName: bot.displayName,
      personality: personality.summary,
      event,
      profanityEnabled: policy.allowProfanity === true,
      intensity: policy.intensity === "conservative" || policy.intensity === "chaos" ? policy.intensity : "normal",
      recentBanter: recentLines(recentData?.messages),
    };

    try {
      const generated = await generateDialogueLine({
        context,
        aiEnabled: providerCall,
        apiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
        model: Deno.env.get("GEMINI_DIALOGUE_MODEL") ?? undefined,
      });
      if (!generated.text) {
        return json({
          ok: true,
          text: null,
          source: "silence",
          providerAttempted: generated.providerAttempted,
          providerReason: generated.providerReason,
        });
      }

      const { data: published, error: publishError } = await admin.rpc("publish_dialogue_message_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
        p_event_id: event.id,
        p_speaker_bot_id: event.speakerBotId,
        p_target_seat: event.targetSeat ?? null,
        p_message_text: generated.text,
        p_source: generated.source === "gemini" ? "gemini" : "preset",
        p_reply_depth: event.replyDepth,
      });
      if (publishError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      if (published?.ok !== true) {
        const code = String(published?.code ?? "SERVICE_UNAVAILABLE");
        if (code === "STALE_DIALOGUE_RESULT" || code === "DUPLICATE_DIALOGUE_LINE") {
          return json({
            ok: true,
            text: null,
            source: "silence",
            providerAttempted: generated.providerAttempted,
            providerReason: code,
          });
        }
        return json({ ok: false, code }, 409);
      }

      return json({
        ok: true,
        message: published.message,
        providerAttempted: generated.providerAttempted,
        providerReason: generated.providerReason,
      });
    } finally {
      if (providerCall) {
        await admin.rpc("release_dialogue_slot_internal", {
          p_session_token: body.sessionToken,
          p_game_id: body.gameId,
          p_event_id: event.id,
        });
      }
    }
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
