import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 end-game release and human avatars", () => {
  it("revokes active-control sessions for every human participant on host End Game", () => {
    const migration = read("supabase/migrations/20261004232919_jk006_release_sessions_on_host_end.sql");
    expect(migration).toContain("update private.player_sessions ps");
    expect(migration).toContain("gp.owner_type = 'human'");
    expect(migration).toContain("active_control = false");
    expect(migration).toContain("revoked_at = coalesce(ps.revoked_at, v_now)");
    expect(migration).toContain("'sessionsReleased', true");
  });

  it("maps all three human players to existing PNG avatar assets", () => {
    const registry = read("src/assets/registry.ts");
    expect(registry).toContain('giobis: "/avatars/giobis.png"');
    expect(registry).toContain('mixalis: "/avatars/mixalis.png"');
    expect(registry).toContain('git: "/avatars/git.png"');
    expect(registry).not.toContain('/avatars/giobis.webp');
    expect(registry).not.toContain('/avatars/mixalis.webp');
    expect(registry).not.toContain('/avatars/git.webp');
  });
});
