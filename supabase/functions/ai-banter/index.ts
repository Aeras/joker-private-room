import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getDialoguePersonality, type DialogueGenerationContext, type PublicDialogueEvent } from "../_shared/dialogue-core.ts";
import { generateDialogueLine } from "../_shared/gemini-dialogue.ts";
import { getCanonicalBot } from "../_shared/bot-catalog.ts";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
function isSessionToken(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value); }
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function publicEvent(value: unknown): PublicDialogueEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const speakerBotId = typeof event.speakerBotId === "string" ? event.speakerBotId : "";
  if (!getCanonicalBot(speakerBotId) || typeof event.id !== "string" || event.id.length < 1 || event.id.length > 128) return null;
  if (typeof event.type !== "string" || typeof event.createdAt !== "string" || Number.isNaN(Date.parse(event.createdAt))) return null;
  const replyDepth = event.replyDepth === 0 || event.replyDepth === 1 ? event.replyDepth : null;
  if (replyDepth === null) return null;
  return {
    id: event.id,
    type: event.type as PublicDialogueEvent["type"],
    createdAt: event.createdAt,
    speakerBotId: speakerBotId as PublicDialogueEvent["speakerBotId"],
    ...(typeof event.targetName === "string" ? { targetName: event.targetName.slice(0, 40) } : {}),
    ...(typeof event.targetSeat === "number" ? { targetSeat: event.targetSeat } : {}),
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);
  try {
    const body = await req.json();
    if (!isSessionToken(body?.sessionToken) || !isUuid(body?.gameId)) return json({ ok: false, code: "NOT_AUTHENTICATED" }, 401);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });

    if (body?.action === "list") {
      const { data, error } = await admin.rpc("list_dialogue_messages_internal", { p_session_token: body.sessionToken, p_game_id: body.gameId });
      if (error) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      return json(data ?? { ok: false, code: "SERVICE_UNAVAILABLE" }, data?.ok === true ? 200 : 404);
    }

    const event = publicEvent(body?.event);
    if (!event) return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);
    const bot = getCanonicalBot(event.speakerBotId);
    const personality = bot ? getDialoguePersonality(bot.personalityId) : null;
    if (!bot || !personality) return json({ ok: false, code: "INVALID_DIALOGUE_TARGET" }, 400);

    const { data: policyData, error: policyError } = await admin.rpc("get_dialogue_policy_internal", { p_session_token: body.sessionToken, p_game_id: body.gameId });
    if (policyError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    const policy = policyData?.policy as Record<string, unknown> | undefined;
    if (policyData?.ok !== true || !policy) return json(policyData ?? { ok: false, code: "GAME_NOT_FOUND" }, 404);
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
      recentBanter: Array.isArray(body?.recentBanter) ? body.recentBanter.filter((line: unknown) => typeof line === "string").slice(-3).map((line: string) => line.slice(0, 100)) : [],
    };

    try {
      const generated = await generateDialogueLine({
        context,
        aiEnabled: providerCall,
        apiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
        model: Deno.env.get("GEMINI_DIALOGUE_MODEL") ?? undefined,
      });
      if (!generated.text) return json({ ok: true, text: null, source: "silence", providerAttempted: generated.providerAttempted });

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
      if (publishError || published?.ok !== true) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      return json({ ok: true, message: published.message, providerAttempted: generated.providerAttempted, providerReason: generated.providerReason });
    } finally {
      if (providerCall) {
        await admin.rpc("release_dialogue_slot_internal", { p_session_token: body.sessionToken, p_game_id: body.gameId, p_event_id: event.id });
      }
    }
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
