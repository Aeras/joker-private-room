import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const edge = readFileSync(
  resolve(process.cwd(), "supabase/functions/game-reconciler/index.ts"),
  "utf8",
);
const deno = readFileSync(
  resolve(process.cwd(), "supabase/functions/game-reconciler/deno.json"),
  "utf8",
);

describe("JK-002 zero-client Edge reconciler", () => {
  it("reuses the one canonical reconciliation core instead of implementing a second game engine", () => {
    expect(edge).toContain("advanceGameUntilBlockedWithDependencies");
    expect(edge).toContain("PRESENTATION_SAFE_AUTOMATIC_STEP_BUDGET");
    expect(edge).not.toContain("applyGameplayCommand(");
    expect(edge).not.toContain("applyOverdueTimeout(");
    expect(edge).not.toContain("settleCanonicalLifecycle(");
    expect(deno).toContain('"@/": "../../../src/"');
  });

  it("consumes a one-time database invocation token before claiming any work", () => {
    const consume = edge.indexOf("consume_game_reconciler_invocation_internal");
    const claim = edge.indexOf("claim_due_games_for_reconciliation_internal");
    expect(consume).toBeGreaterThan(0);
    expect(claim).toBeGreaterThan(consume);
    expect(edge).toContain('code: "NOT_AUTHORIZED"');
  });

  it("binds every load, persist and finalize operation to the server-issued claim token", () => {
    expect(edge).toContain("load_game_state_for_reconciliation_internal");
    expect(edge).toContain("persist_game_state_for_reconciliation_internal");
    expect(edge).toContain("finalize_game_for_reconciliation_internal");
    expect(edge.match(/p_claim_token: claimToken/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(edge).toContain("release_game_reconciliation_claim_internal");
  });

  it("preserves request-path fingerprint semantics for worker retries", () => {
    expect(edge).toContain("fingerprintJson({");
    expect(edge).toContain("commandType: input.commandType");
    expect(edge).toContain("payload: input.commandPayload");
    expect(edge).toContain('commandType: "finalize_game"');
    expect(edge).toContain("totals: input.newState.score.cumulativeTotals");
    expect(edge).toContain("placements: input.newState.score.finalPlacements");
  });

  it("uses service credentials only from Edge environment and never expects a human session", () => {
    expect(edge).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(edge).toContain('Deno.env.get("SUPABASE_URL")');
    expect(edge).not.toContain("sessionToken");
    expect(edge).not.toContain("playerId");
  });

  it("returns only bounded operational summaries, never canonical state or hidden cards", () => {
    const responseSection = edge.slice(edge.indexOf("results.push("));
    expect(responseSection).toContain("stateVersion");
    expect(responseSection).toContain("steps");
    expect(responseSection).toContain("stopReason");
    expect(responseSection).not.toContain("canonicalState: result");
    expect(responseSection).not.toContain("hands:");
    expect(responseSection).not.toContain("deck:");
  });
});
