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

  it("uses the uploaded replacement PNGs for the three human players", () => {
    const registry = read("src/assets/registry.ts");
    expect(registry).toContain('giobis: "/avatars/giobis2.png"');
    expect(registry).toContain('"ζωάλο πουτς": "/avatars/giobis2.png"');
    expect(registry).toContain('mixalis: "/avatars/mixalis2.png"');
    expect(registry).toContain('"τζαμανάς δικώνετε": "/avatars/mixalis2.png"');
    expect(registry).toContain('git: "/avatars/git2.png"');
    expect(registry).not.toContain('/avatars/giobis.webp');
    expect(registry).not.toContain('/avatars/mixalis.webp');
    expect(registry).not.toContain('/avatars/git.webp');
  });

  it("renames only display names without changing player IDs, PINs or credentials", () => {
    const migration = read("supabase/migrations/20261005090139_rename_human_display_names.sql");
    expect(migration).toContain("set display_name = 'Ζωάλο Πουτς'");
    expect(migration).toContain("where display_name = 'Giobis'");
    expect(migration).toContain("set display_name = 'Τζαμανάς Δικώνετε'");
    expect(migration).toContain("where display_name = 'Mixalis'");
    expect(migration).not.toMatch(/player_credentials|pin_hash|player_sessions|\bid\s*=/i);
  });
});
