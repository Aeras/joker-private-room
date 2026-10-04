import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-002 active-game lookup and routing", () => {
  it("reuses the existing canonical active-game invariant and keeps lookup service-role only", () => {
    const migration = read("supabase/migrations/20261004160830_jk002_active_game_lookup.sql");
    expect(migration).toContain("private.active_game_for_player_internal(v_player_id)");
    expect(migration).toContain("validate_player_session_internal(p_session_token)");
    expect(migration).toContain("revoke all on function public.get_current_active_game_internal(text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function public.get_current_active_game_internal(text) to service_role");
    expect(migration).not.toContain("p_player_id");
  });

  it("exposes lookup through the authenticated server-owned room edge path without an action id", () => {
    const edge = read("supabase/functions/room-commands/index.ts");
    const service = read("src/services/roomFunctions.ts");
    expect(edge).toContain('action === "active_game"');
    expect(edge).toContain('rpcName = "get_current_active_game_internal"');
    expect(service).toContain('action: "active_game"');
    expect(service).toContain("getCookie(SESSION_COOKIE)");
    expect(service).not.toContain("playerId: data");
  });

  it("fails Home closed on lookup failure and offers direct return when an active game exists", () => {
    const home = read("src/routes/index.tsx");
    expect(home).toContain('activeLookup.status === "error"');
    expect(home).toContain("Δεν ήταν δυνατός ο έλεγχος ενεργού παιχνιδιού");
    expect(home).toContain("Επιστροφή στο παιχνίδι");
    expect(home).toContain('to="/table"');
    expect(home).toContain("activeLookup.activeGame.gameId");
  });

  it("guards deep-linked Create and Join and rechecks immediately after authentication", () => {
    const create = read("src/routes/create.tsx");
    const join = read("src/routes/join.tsx");

    for (const source of [create, join]) {
      expect(source).toContain("useCurrentActiveGame()");
      expect(source).toContain("await activeLookup.refresh()");
      expect(source).toContain('current.code === "SERVICE_UNAVAILABLE"');
      expect(source).toContain('to: "/table"');
      expect(source).toContain('activeLookup.status === "error"');
    }
  });
});
