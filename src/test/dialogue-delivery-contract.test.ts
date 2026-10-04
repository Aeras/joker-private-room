import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261004110851_jk001_ai_banter_phase_c_ephemeral_delivery.sql",
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
    expect(migration).not.toContain("canonical_state");
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
    expect(service).toContain('getCookie(SESSION_COOKIE)');
    expect(service).toContain('body: JSON.stringify({ ...body, sessionToken })');
    expect(service).not.toContain("sessionToken: z.");
    expect(service).not.toContain("viewerSeat");
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
});
