import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  getDialoguePersonality,
  type DialogueGenerationContext,
  type DialogueEventType,
  type PublicDialogueEvent,
} from "../_shared/dialogue-core.ts";
import { generateDialogueLine } from "../_shared/xai-dialogue.ts";
import { getCanonicalBot } from "../_shared/bot-catalog.ts";
import { synthesizeBotSpeech } from "../_shared/google-tts.ts";

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
  "TRICK_WON",
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

function trustedPublicEvent(value: unknown): PublicDialogueEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  const speakerBotId = typeof event.speakerBotId === "string" ? event.speakerBotId : "";
  if (!getCanonicalBot(speakerBotId)) return null;
  if (typeof event.id !== "string" || event.id.length < 1 || event.id.length > 128) return null;
  if (!isDialogueEventType(event.type)) return null;
  if (typeof event.createdAt !== "string" || Number.isNaN(Date.parse(event.createdAt))) return null;
  const replyDepth = event.replyDepth === 0 || event.replyDepth === 1 ? event.replyDepth : null;
  if (replyDepth === null) return null;

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

function tableParticipants(value: unknown): DialogueGenerationContext["tableParticipants"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const seat = typeof row.seat === "number" && Number.isInteger(row.seat) && row.seat >= 0 && row.seat <= 3
      ? row.seat
      : null;
    const kind = row.kind === "human" || row.kind === "bot" ? row.kind : null;
    const displayName = typeof row.displayName === "string" ? row.displayName.trim().slice(0, 40) : "";
    if (seat === null || !kind || !displayName) return [];
    const botId = kind === "bot" && typeof row.botId === "string" && getCanonicalBot(row.botId)
      ? row.botId as DialogueGenerationContext["tableParticipants"][number]["botId"]
      : undefined;
    return [{ seat, kind, displayName, ...(botId ? { botId } : {}) }];
  }).slice(0, 4);
}

function recentLines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.text !== "string") return [];
      const speaker = typeof row.speakerBotId === "string" ? row.speakerBotId.slice(0, 64) : "bot";
      return [`${speaker}: ${row.text.slice(0, 100)}`];
    })
    .slice(-10);
}

function logDialogueOutcome(input: {
  event: PublicDialogueEvent;
  source: "xai" | "preset" | "silence";
  providerAttempted: boolean;
  providerReason?: string;
  elapsedMs: number;
}) {
  console.info(JSON.stringify({
    kind: "dialogue_generation_outcome",
    eventType: input.event.type,
    speakerBotId: input.event.speakerBotId,
    replyDepth: input.event.replyDepth,
    source: input.source,
    providerAttempted: input.providerAttempted,
    providerReason: input.providerReason ?? null,
    elapsedMs: input.elapsedMs,
  }));
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

    let event: PublicDialogueEvent | null = null;

    if (body?.action === "generate-state") {
      if (typeof body?.eventId !== "string" || body.eventId.length < 1 || body.eventId.length > 128) {
        return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);
      }
      const { data, error } = await admin.rpc("resolve_dialogue_state_event_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
        p_event_id: body.eventId,
      });
      if (error) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      if (data?.ok !== true) return json(data ?? { ok: false, code: "INVALID_DIALOGUE_EVENT" }, 409);
      event = trustedPublicEvent(data.event);
    } else if (body?.action === "human-message") {
      const text = typeof body?.text === "string" ? body.text.trim().slice(0, 160) : "";
      const speakerBotId = typeof body?.speakerBotId === "string" ? body.speakerBotId : "";
      if (!isUuid(body?.actionId) || !text || !getCanonicalBot(speakerBotId)) {
        return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);
      }
      event = {
        id: `human:${body.actionId}`,
        type: "HUMAN_MESSAGE_TO_BOT",
        createdAt: new Date().toISOString(),
        speakerBotId: speakerBotId as PublicDialogueEvent["speakerBotId"],
        humanMessage: text,
        replyDepth: 0,
      };
    } else if (body?.action === "bot-reply") {
      const responderBotId = typeof body?.responderBotId === "string" ? body.responderBotId : "";
      if (!isUuid(body?.sourceMessageId) || !getCanonicalBot(responderBotId)) {
        return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);
      }
      const { data, error } = await admin.rpc("list_dialogue_messages_internal", {
        p_session_token: body.sessionToken,
        p_game_id: body.gameId,
      });
      if (error) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      if (data?.ok !== true || !Array.isArray(data.messages)) {
        return json(data ?? { ok: false, code: "GAME_NOT_FOUND" }, 404);
      }
      const source = data.messages.find((message: Record<string, unknown>) => message?.id === body.sourceMessageId);
      if (!source || source.replyDepth !== 0 || typeof source.text !== "string" || source.speakerBotId === responderBotId) {
        return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 409);
      }
      event = {
        id: `reply:${body.sourceMessageId}:${responderBotId}`,
        type: "BOT_MESSAGE_TO_BOT",
        createdAt: new Date().toISOString(),
        speakerBotId: responderBotId as PublicDialogueEvent["speakerBotId"],
        publicSummary: `${String(source.speakerBotId).slice(0, 64)}: ${source.text.slice(0, 100)}`,
        replyDepth: 1,
      };
    } else {
      return json({ ok: false, code: "INVALID_REQUEST" }, 400);
    }

    if (!event) return json({ ok: false, code: "INVALID_DIALOGUE_EVENT" }, 400);

    const bot = getCanonicalBot(event.speakerBotId);
    const personality = bot ? getDialoguePersonality(bot.personalityId) : null;
    if (!bot || !personality) return json({ ok: false, code: "INVALID_DIALOGUE_TARGET" }, 400);

    const policyPromise = admin.rpc("get_dialogue_policy_internal", {
      p_session_token: body.sessionToken,
      p_game_id: body.gameId,
    });
    const recentPromise = admin.rpc("get_dialogue_recent_context_internal", {
      p_session_token: body.sessionToken,
      p_game_id: body.gameId,
    });
    const tablePromise = admin.rpc("get_dialogue_table_context_internal", {
      p_session_token: body.sessionToken,
      p_game_id: body.gameId,
    });

    const [
      { data: policyData, error: policyError },
      { data: latestRecentData, error: recentError },
      { data: tableData, error: tableError },
    ] = await Promise.all([policyPromise, recentPromise, tablePromise]);
    if (policyError || recentError || tableError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);

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
      recentBanter: recentLines(latestRecentData?.messages),
      tableParticipants: tableParticipants(tableData?.participants),
    };

    try {
      const generationStartedAt = Date.now();
      const generated = await generateDialogueLine({
        context,
        aiEnabled: providerCall,
        apiKey: Deno.env.get("XAI_API_KEY") ?? undefined,
        model: Deno.env.get("XAI_DIALOGUE_MODEL") ?? undefined,
      });
      if (!generated.text) {
        logDialogueOutcome({
          event,
          source: "silence",
          providerAttempted: generated.providerAttempted,
          providerReason: generated.providerReason,
          elapsedMs: Date.now() - generationStartedAt,
        });
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
        p_source: generated.source === "xai" ? "xai" : "preset",
        p_reply_depth: event.replyDepth,
      });
      if (publishError) return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
      if (published?.ok !== true) {
        const code = String(published?.code ?? "SERVICE_UNAVAILABLE");
        if (code === "STALE_DIALOGUE_RESULT" || code === "DUPLICATE_DIALOGUE_LINE") {
          logDialogueOutcome({
            event,
            source: "silence",
            providerAttempted: generated.providerAttempted,
            providerReason: code,
            elapsedMs: Date.now() - generationStartedAt,
          });
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

      let publishedMessage = published.message;
      if (policy.ttsEnabled === true) {
        const speech = await synthesizeBotSpeech({
          botId: bot.id,
          text: generated.text,
          serviceAccountJson: Deno.env.get("GOOGLE_TTS_SERVICE_ACCOUNT_JSON") ?? undefined,
        });
        if (speech) {
          const { data: attached, error: attachError } = await admin.rpc("attach_dialogue_audio_internal", {
            p_session_token: body.sessionToken,
            p_game_id: body.gameId,
            p_event_id: event.id,
            p_speaker_bot_id: event.speakerBotId,
            p_audio_content: speech.audioContent,
            p_audio_mime_type: speech.mimeType,
            p_tts_voice_name: speech.voiceName,
          });
          if (!attachError && attached?.ok === true && publishedMessage && typeof publishedMessage === "object") {
            publishedMessage = {
              ...publishedMessage,
              audioContent: speech.audioContent,
              audioMimeType: speech.mimeType,
              ttsVoiceName: speech.voiceName,
            };
          }
        }
      }

      logDialogueOutcome({
        event,
        source: generated.source,
        providerAttempted: generated.providerAttempted,
        providerReason: generated.providerReason,
        elapsedMs: Date.now() - generationStartedAt,
      });
      return json({
        ok: true,
        message: publishedMessage,
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
