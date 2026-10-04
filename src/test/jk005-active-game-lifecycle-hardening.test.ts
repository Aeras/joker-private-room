import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migrationPath = "supabase/migrations/20261005090000_jk005_harden_active_game_lookup.sql";

describe("JK-005 active-game lifecycle hardening", () => {
  it("repairs stale active participants that belong to completed games", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("update public.game_participants gp");
    expect(migration).toContain("g.lifecycle = 'complete'");
    expect(migration).toContain("gp.status = 'active'");
    expect(migration).toContain("set status = 'completed'");
  });

  it("requires both active participant ownership and an actually active game lifecycle", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("create or replace function private.active_game_for_player_internal");
    expect(migration).toContain("gp.owner_type = 'human'");
    expect(migration).toContain("gp.status = 'active'");
    expect(migration).toContain("g.lifecycle in ('starting', 'active')");
  });
});
