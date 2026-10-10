import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("end-game preserves player login on every device", () => {
  it("does not revoke the secure session when ending a game", () => {
    const sql = read("supabase/migrations/20261010063000_jk006_keep_player_login_after_end.sql");
    expect(sql).toContain("create or replace function public.terminate_game_by_host_internal(");
    expect(sql).toContain("set status = 'completed'");
    expect(sql).not.toMatch(/update\s+private\.player_sessions/i);
    expect(sql).not.toMatch(/set\s+active_control\s*=\s*false/i);
    expect(sql).not.toMatch(/set\s+revoked_at\s*=/i);
  });

  it("routes the host to the signed-in home without logging out", () => {
    const menu = read("src/components/table/TableUtilityMenu.tsx");
    expect(menu).toContain('window.location.assign("/joker")');
    expect(menu).not.toContain("logoutPlayer");
    expect(menu).toContain("const ok = await onEndGame()");
  });

  it("Joker home retains create and join choices", () => {
    const home = read("src/routes/joker.tsx");
    expect(home).toContain("<PlayerSessionGate");
    expect(home).toContain('to="/create"');
    expect(home).toContain('to="/join"');
  });
});
