import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261004195000_jk002_reconciler_worker_boundary.sql"),
  "utf8",
);

describe("JK-002 reconciler worker authority boundary", () => {
  it("uses one-time invocation tokens and service-role-only execution", () => {
    expect(migration).toContain("game_reconciler_invocations");
    expect(migration).toContain("consumed_at is null");
    expect(migration).toContain("expires_at >= now()");
    expect(migration).toContain("consume_game_reconciler_invocation_internal");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("claims only due non-complete games with bounded leases and skip-locked concurrency", () => {
    expect(migration).toContain("next_wakeup_at <= now()");
    expect(migration).toContain("g.lifecycle in ('starting', 'active')");
    expect(migration).toContain("for update of g skip locked");
    expect(migration).toContain("greatest(10, least(coalesce(p_lease_seconds, 45), 120))");
    expect(migration).toContain("claim_until < now()");
  });

  it("requires a live claim for worker load, persist and finalize", () => {
    expect(migration).toContain("valid_game_reconciliation_claim_internal");
    expect(migration.match(/CLAIM_NOT_HELD/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("load_game_state_for_reconciliation_internal");
    expect(migration).toContain("persist_game_state_for_reconciliation_internal");
    expect(migration).toContain("finalize_game_for_reconciliation_internal");
  });

  it("keeps worker writes on the same state-version CAS and canonical-state invariants", () => {
    expect(migration).toContain("if v_game.state_version <> p_expected_state_version");
    expect(migration).toContain("'code', 'STALE_STATE'");
    expect(migration).toContain("(p_new_state->>'stateVersion')::bigint <> v_next_version");
    expect(migration).toContain("(p_new_state->>'gameId') is distinct from v_game.id::text");
    expect(migration).toContain("FINALIZATION_REQUIRED");
  });

  it("preserves atomic finalization semantics for participants and immutable history", () => {
    expect(migration).toContain("set status = 'completed'");
    expect(migration).toContain("final_score =");
    expect(migration).toContain("final_placement =");
    expect(migration).toContain("insert into public.game_history");
    expect(migration).toContain("FINALIZATION_PARTICIPANT_INVARIANT_FAILED");
    expect(migration).toContain("delete from private.game_reconciliation_claims");
  });

  it("keeps worker retries idempotent with a separate server-owned command ledger", () => {
    expect(migration).toContain("private.game_reconciliation_command_ledger");
    expect(migration).toContain("action_id uuid primary key");
    expect(migration).toContain("request_fingerprint");
    expect(migration).toContain("jsonb_build_object('replayed', true)");
    expect(migration).toContain("ACTION_ID_CONFLICT");
  });
});
