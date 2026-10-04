import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migrationPath = "supabase/migrations/20261004222000_jk005_stale_session_reclaim.sql";

describe("JK-005 stale session reclaim", () => {
  it("reclaims only stale sessions for players without a real active game", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("reclaim_stale_player_session_for_auth_internal");
    expect(migration).toContain("private.active_game_for_player_internal(p_player_id) is not null");
    expect(migration).toContain("last_seen_at <= v_now - interval '5 minutes'");
    expect(migration).toContain("active_control = false");
    expect(migration).toContain("revoked_at = coalesce");
  });

  it("keeps the reclaim RPC service-role only", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("revoke all on function public.reclaim_stale_player_session_for_auth_internal(uuid)");
    expect(migration).toContain("grant execute on function public.reclaim_stale_player_session_for_auth_internal(uuid)");
    expect(migration).toContain("to service_role");
  });

  it("runs stale reclaim before normal PIN authentication", () => {
    const edge = read("supabase/functions/verify-player-pin/index.ts");
    const reclaimIndex = edge.indexOf("reclaim_stale_player_session_for_auth_internal");
    const authenticateIndex = edge.indexOf("authenticate_player_pin_internal");

    expect(reclaimIndex).toBeGreaterThan(-1);
    expect(authenticateIndex).toBeGreaterThan(reclaimIndex);
    expect(edge).toContain('code: "SECOND_ACTIVE_CONNECTION"');
  });
});
