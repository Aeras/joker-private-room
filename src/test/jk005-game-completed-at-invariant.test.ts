import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const migrationPath = "supabase/migrations/20261004215449_jk005_game_completed_at_invariant.sql";

describe("JK-005 game completed_at invariant", () => {
  it("stamps completed_at whenever a game transitions to complete", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("create trigger set_game_completed_at_on_completion");
    expect(migration).toContain("before update of lifecycle on public.games");
    expect(migration).toContain("new.lifecycle = 'complete'");
    expect(migration).toContain("new.completed_at := coalesce(new.completed_at, now())");
  });

  it("backfills completed games from authoritative history without inventing a new timestamp", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("set completed_at = h.completed_at");
    expect(migration).toContain("from public.game_history h");
    expect(migration).toContain("g.lifecycle = 'complete'");
    expect(migration).toContain("g.completed_at is null");
  });
});
