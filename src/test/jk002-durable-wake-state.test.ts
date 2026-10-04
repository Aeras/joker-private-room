import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261004161950_jk002_durable_wake_state.sql"),
  "utf8",
);

describe("JK-002 durable wake state", () => {
  it("stores and indexes a first-class next_wakeup_at instead of scanning canonical JSON", () => {
    expect(migration).toContain("add column if not exists next_wakeup_at timestamptz");
    expect(migration).toContain("games_next_wakeup_due_idx");
    expect(migration).toContain("on public.games (next_wakeup_at, id)");
  });

  it("maintains wake state in the same canonical-state transaction through a database trigger", () => {
    expect(migration).toContain("before insert or update of canonical_state, lifecycle");
    expect(migration).toContain("new.next_wakeup_at := private.derive_game_next_wakeup_internal");
    expect(migration).toContain("new.canonical_state");
    expect(migration).toContain("new.lifecycle");
  });

  it("uses human deadlines, wakes automatic controllers immediately, and clears completed games", () => {
    expect(migration).toContain("if p_lifecycle = 'complete'");
    expect(migration).toContain("return null");
    expect(migration).toContain("v_controller in ('permanent_bot', 'temporary_bot')");
    expect(migration).toContain("return v_deadline");
    expect(migration).toContain("currentHumanDeadline");
  });

  it("fails toward due-now repair instead of allowing a missing wake to strand an active game", () => {
    expect(migration).toContain("Missing deadline would otherwise strand an active human turn");
    expect(migration).toContain("A non-complete game without a valid actor is reconciliation work");
    expect(migration).toContain("where lifecycle in ('starting', 'active')");
  });

  it("keeps helper functions outside public client authority", () => {
    expect(migration).toContain("revoke all on function private.derive_game_next_wakeup_internal");
    expect(migration).toContain("revoke all on function private.sync_game_next_wakeup_internal");
    expect(migration).toContain("revoke all on public.games from public, anon, authenticated");
  });
});
