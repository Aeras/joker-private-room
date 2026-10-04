import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read = (path: string) => readFileSync(path, "utf8");
describe("JK-002 message authority boundary", () => {
  const sql = read("supabase/migrations/20261004183758_jk002_ephemeral_table_messages.sql");
  const edge = read("supabase/functions/table-messages/index.ts");
  const service = read("src/services/tableMessageFunctions.ts");
  it("derives the sender from the canonical session and restricts private transport state", () => {
    expect(sql).toContain("validate_player_session_internal(p_session_token)");
    expect(sql).toContain("gp.player_id=v_player");
    expect(sql).toContain("p_target_seat=v_sender");
    expect(sql).toContain("interval '5 seconds'");
    expect(sql).toContain("m.expires_at>v_now");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("RATE_LIMITED");
    expect(sql).toContain("enable row level security");
    expect(sql).toContain("from public,anon,authenticated");
  });
  it("never calls gameplay reconciliation, history or AI from message transport", () => {
    expect(edge).not.toMatch(/advanceGame|canonical_state|ai-banter|gemini/i);
    expect(sql).not.toContain("update public.games");
    expect(sql).not.toContain("game_history");
    expect(service).toContain('__Host-joker_session');
    expect(service.slice(service.indexOf("export const sendTableMessage"))).not.toContain(
      "fromSeat:",
    );
    expect(read("src/components/table/TableMessaging.tsx")).not.toMatch(
      /localStorage|createLocalEphemeralChannel|onCommand|onReclaim/,
    );
  });
});
