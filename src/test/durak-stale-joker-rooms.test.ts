import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261011054500_durak_stale_joker_membership_guard.sql"), "utf8");
describe("DURAK must ignore completed historical JOKER rooms", () => {
  it("does not treat old playing rooms as active seats", () => {
    expect(sql).not.toContain("r.status in ('lobby','playing')");
    expect(sql).toContain("r.status='lobby'");
  });
  it("checks actual active game participants, not stale room state", () => {
    expect(sql).toContain("gp.status='active'");
    expect(sql).toContain("g.lifecycle in ('starting','active')");
  });
  it("preserves shared transaction locks across game types", () => {
    expect(sql).toContain("hashtextextended(v_player::text, 20261009)");
    expect(sql).toContain("hashtextextended(new.player_id::text, 20261009)");
  });
  it("does not open privileged RPC to anonymous users", () => {
    expect(sql).toContain("revoke all on function public.durak_room_command_internal");
    expect(sql).toContain("to service_role");
  });
});
