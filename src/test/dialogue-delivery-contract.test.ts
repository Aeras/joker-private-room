import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004110851_jk001_ai_banter_phase_c_ephemeral_delivery.sql",
  "utf8",
);
const hardening = readFileSync(
  "supabase/migrations/20261004112919_jk001_ai_banter_phase_c_delivery_hardening.sql",
  "utf8",
);
const serverEvents = readFileSync(
  "supabase/migrations/20261004115502_jk001_ai_banter_phase_c_server_event_resolution.sql",
  "utf8",
);
const edge = readFileSync("supabase/functions/ai-banter/index.ts", "utf8");
const service = readFileSync("src/services/dialogueFunctions.ts", "utf8");
const overlay = readFileSync("src/components/table/DialogueOverlay.tsx", "utf8");
const table = readFileSync("src/routes/table.tsx", "utf8");

describe("AI banter Phase C delivery contract", () => {
  it("uses private short-TTL delivery instead of persistent history", () => {
    expect(migration).toContain("private.dialogue_messages");
    expect(migration).toContain("interval '8 seconds'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on private.dialogue_messages from public, anon, authenticated");
    expect(migration).not.toContain("game_history");
  });

  it("enforces dedup, cooldown, human rate limiting and depth at the server boundary", () => {
    expect(migration).toContain("DUPLICATE_DIALOGUE_EVENT");
    expect(migration).toContain("DIALOGUE_COOLDOWN");
    expect(migration).toContain("DIALOGUE_SPEAKER_COOLDOWN");
    expect(migration).toContain("HUMAN_MESSAGE_RATE_LIMITED");
    expect(migration).toContain("p_reply_depth not between 0 and 1");
    expect(migration).toContain("p_provider_call");
  });

  it("keeps the opaque session on the server and never accepts a browser seat as authority", () => {
    expect(service).toContain("getCookie(SESSION_COOKIE)");
    expect(service).toContain("body: JSON.stringify({ ...body, sessionToken })");
    expect(service).not.toContain("sessionToken: z.");
    expect(service).not.toContain("viewerSeat");
  });

  it("resolves state-derived event type and data from committed server-owned game state", () => {
    expect(edge).toContain('body?.action === "generate-state"');
    expect(edge).toContain('admin.rpc("resolve_dialogue_state_event_internal"');
    expect(edge).not.toContain("body?.event");
    expect(service).toContain("eventId: dialogueEventId");
    expect(service).not.toContain("const event = z.object");
    expect(serverEvents).toContain("g.canonical_state");
    expect(serverEvents).toContain("v_event_type <> v_expected_type");
    expect(serverEvents).toContain("v_speaker_bot_id := v_bots[");
    expect(serverEvents).toContain("STALE_DIALOGUE_EVENT");
  });

  it("builds human and bot-reply event payloads server-side", () => {
    expect(service).toContain('action: "human-message"');
    expect(service).toContain('action: "bot-reply"');
    expect(edge).toContain('type: "HUMAN_MESSAGE_TO_BOT"');
    expect(edge).toContain('type: "BOT_MESSAGE_TO_BOT"');
    expect(edge).toContain('source.replyDepth !== 0');
    expect(edge).toContain('id: `reply:${body.sourceMessageId}:${responderBotId}`');
    expect(table).toContain("requestBotDialogueReply");
    expect(table).not.toContain('type: "BOT_MESSAGE_TO_BOT"');
  });

  it("builds recent provider context from server-side ephemeral delivery, never client-supplied history", () => {
    expect(edge).toContain('admin.rpc("list_dialogue_messages_internal"');
    expect(edge).toContain("recentBanter: recentLines(latestRecentData?.messages)");
    expect(edge).not.toContain("body?.recentBanter");
  });

  it("makes dialogue fire-and-forget relative to gameplay refresh", () => {
    expect(table).toContain("setProjection(result.projection)");
    expect(table).toContain("void requestDialogueReaction");
    expect(table).not.toContain("await requestDialogueReaction");
  });

  it("shows required external-AI disclosure at the human-to-bot surface", () => {
    expect(overlay).toContain("μπορεί να επεξεργαστεί από εξωτερικό πάροχο AI");
    expect(overlay).toContain("room.botSettings.aiEnabled");
  });

  it("publishes only preset/gemini ephemeral text after a claimed event", () => {
    expect(edge).toContain('admin.rpc("claim_dialogue_event_internal"');
    expect(edge).toContain('admin.rpc("publish_dialogue_message_internal"');
    expect(migration).toContain("DIALOGUE_EVENT_NOT_CLAIMED");
    expect(migration).toContain("source in ('preset', 'gemini')");
  });

  it("drops stale provider results and duplicate active lines as silence", () => {
    expect(hardening).toContain("STALE_DIALOGUE_RESULT");
    expect(hardening).toContain("DUPLICATE_DIALOGUE_LINE");
    expect(hardening).toContain("v_current_state_version > v_event_state_version + 1");
    expect(edge).toContain('code === "STALE_DIALOGUE_RESULT" || code === "DUPLICATE_DIALOGUE_LINE"');
    expect(edge).toContain('source: "silence"');
  });
});
