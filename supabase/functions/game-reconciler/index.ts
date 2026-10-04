import { assertRulesetState } from "@/domain/rulesetValidation.ts";
import type { CanonicalGameState } from "@/domain/gameState.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import { MAX_SYNCHRONOUS_BOT_STEPS } from "@/domain/controller.ts";
import { fingerprintJson } from "@/lib/stableFingerprint.ts";
import {
  deterministicRandomUnitsFromSeed,
  stableInternalActionId,
} from "@/server/internalDeterminism.ts";
import {
  advanceGameUntilBlockedWithDependencies,
  type ReconciliationDependencies,
  type ReconciliationFinalizeInput,
  type ReconciliationLoadResult,
  type ReconciliationPersistInput,
  type ReconciliationPersistResult,
} from "@/server/reconciliationCore.ts";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_GAMES_PER_INVOCATION = 4;
const CLAIM_LEASE_SECONDS = 60;

type SupabaseAdmin = ReturnType<typeof createClient>;

type ClaimedGame = {
  gameId: string;
  claimToken: string;
  stateVersion: number;
  claimUntil: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function workerFailure(code: unknown, stateVersion?: number): ReconciliationLoadResult {
  const safe =
    code === "GAME_NOT_FOUND" ||
    code === "GAME_STATE_NOT_INITIALIZED" ||
    code === "ACTION_ID_CONFLICT" ||
    code === "STALE_STATE" ||
    code === "INVALID_REQUEST" ||
    code === "INVALID_CANONICAL_STATE" ||
    code === "FINALIZATION_REQUIRED"
      ? code
      : "SERVICE_UNAVAILABLE";
  return stateVersion == null
    ? { ok: false, code: safe }
    : { ok: false, code: safe, stateVersion };
}

function workerPersistFailure(
  code: unknown,
  currentStateVersion?: number,
): ReconciliationPersistResult {
  const safe =
    code === "GAME_NOT_FOUND" ||
    code === "GAME_STATE_NOT_INITIALIZED" ||
    code === "ACTION_ID_CONFLICT" ||
    code === "STALE_STATE" ||
    code === "INVALID_REQUEST" ||
    code === "INVALID_CANONICAL_STATE" ||
    code === "FINALIZATION_REQUIRED"
      ? code
      : "SERVICE_UNAVAILABLE";
  return currentStateVersion == null
    ? { ok: false, code: safe }
    : { ok: false, code: safe, currentStateVersion };
}

function dependenciesForClaim(
  admin: SupabaseAdmin,
  claimToken: string,
): ReconciliationDependencies {
  return {
    async load(gameId) {
      const { data, error } = await admin.rpc("load_game_state_for_reconciliation_internal", {
        p_game_id: gameId,
        p_claim_token: claimToken,
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data as Record<string, unknown>;
      if (result.ok !== true) {
        return workerFailure(
          result.code,
          typeof result.stateVersion === "number" ? result.stateVersion : undefined,
        );
      }
      if (
        typeof result.gameId !== "string" ||
        typeof result.stateVersion !== "number" ||
        !result.canonicalState ||
        typeof result.canonicalState !== "object"
      ) {
        return { ok: false, code: "INVALID_CANONICAL_STATE" };
      }
      try { assertRulesetState(result.canonicalState as CanonicalGameState); } catch { return { ok: false, code: "INVALID_CANONICAL_STATE" }; }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        canonicalState: result.canonicalState as ReconciliationLoadResult extends { canonicalState: infer T } ? T : never,
      };
    },

    async persist(input: ReconciliationPersistInput) {
      const requestFingerprint = await fingerprintJson({
        gameId: input.gameId,
        commandType: input.commandType,
        expectedStateVersion: input.expectedStateVersion,
        payload: input.commandPayload,
      });
      const { data, error } = await admin.rpc("persist_game_state_for_reconciliation_internal", {
        p_game_id: input.gameId,
        p_claim_token: claimToken,
        p_action_id: input.actionId,
        p_command_type: input.commandType,
        p_expected_state_version: input.expectedStateVersion,
        p_request_fingerprint: requestFingerprint,
        p_new_state: input.newState,
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data as Record<string, unknown>;
      if (result.ok !== true) {
        return workerPersistFailure(
          result.code,
          typeof result.currentStateVersion === "number" ? result.currentStateVersion : undefined,
        );
      }
      if (
        typeof result.gameId !== "string" ||
        typeof result.stateVersion !== "number" ||
        (result.lifecycle !== "starting" && result.lifecycle !== "active" && result.lifecycle !== "complete")
      ) {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        lifecycle: result.lifecycle,
        replayed: result.replayed === true,
      };
    },

    async finalize(input: ReconciliationFinalizeInput) {
      const requestFingerprint = await fingerprintJson({
        gameId: input.gameId,
        commandType: "finalize_game",
        expectedStateVersion: input.expectedStateVersion,
        totals: input.newState.score.cumulativeTotals,
        placements: input.newState.score.finalPlacements,
      });
      const { data, error } = await admin.rpc("finalize_game_for_reconciliation_internal", {
        p_game_id: input.gameId,
        p_claim_token: claimToken,
        p_action_id: input.actionId,
        p_expected_state_version: input.expectedStateVersion,
        p_request_fingerprint: requestFingerprint,
        p_new_state: input.newState,
      });
      if (error || !data || typeof data !== "object") {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      const result = data as Record<string, unknown>;
      if (result.ok !== true) {
        return workerPersistFailure(
          result.code,
          typeof result.currentStateVersion === "number" ? result.currentStateVersion : undefined,
        );
      }
      if (
        typeof result.gameId !== "string" ||
        typeof result.stateVersion !== "number" ||
        result.lifecycle !== "complete"
      ) {
        return { ok: false, code: "SERVICE_UNAVAILABLE" };
      }
      return {
        ok: true,
        gameId: result.gameId,
        stateVersion: result.stateVersion,
        lifecycle: "complete",
        replayed: result.replayed === true,
      };
    },

    actionId: stableInternalActionId,
    randomUnits: deterministicRandomUnitsFromSeed,
    now: () => new Date().toISOString(),
  };
}

async function releaseClaim(admin: SupabaseAdmin, claim: ClaimedGame) {
  await admin.rpc("release_game_reconciliation_claim_internal", {
    p_game_id: claim.gameId,
    p_claim_token: claim.claimToken,
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, code: "INVALID_REQUEST" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const body = await req.json();
    const invocationToken = typeof body?.invocationToken === "string" ? body.invocationToken : "";
    if (!uuidPattern.test(invocationToken)) {
      return json({ ok: false, code: "NOT_AUTHORIZED" }, 401);
    }

    const { data: consumed, error: consumeError } = await admin.rpc(
      "consume_game_reconciler_invocation_internal",
      { p_token: invocationToken },
    );
    if (consumeError || consumed !== true) {
      return json({ ok: false, code: "NOT_AUTHORIZED" }, 401);
    }

    const { data: claimedData, error: claimError } = await admin.rpc(
      "claim_due_games_for_reconciliation_internal",
      { p_limit: MAX_GAMES_PER_INVOCATION, p_lease_seconds: CLAIM_LEASE_SECONDS },
    );
    if (claimError || !Array.isArray(claimedData)) {
      return json({ ok: false, code: "SERVICE_UNAVAILABLE" }, 503);
    }

    const claims = claimedData.filter(
      (value): value is ClaimedGame =>
        value &&
        typeof value === "object" &&
        typeof value.gameId === "string" &&
        typeof value.claimToken === "string" &&
        typeof value.stateVersion === "number" &&
        typeof value.claimUntil === "string" &&
        uuidPattern.test(value.gameId) &&
        uuidPattern.test(value.claimToken),
    );

    const results: Array<Record<string, unknown>> = [];
    for (const claim of claims) {
      try {
        const result = await advanceGameUntilBlockedWithDependencies(
          claim.gameId,
          MAX_SYNCHRONOUS_BOT_STEPS,
          dependenciesForClaim(admin, claim.claimToken),
        );
        results.push(
          result.ok
            ? {
                gameId: claim.gameId,
                ok: true,
                stateVersion: result.stateVersion,
                steps: result.steps,
                stopReason: result.stopReason,
              }
            : {
                gameId: claim.gameId,
                ok: false,
                code: result.code,
                currentStateVersion: result.currentStateVersion,
              },
        );
      } catch {
        results.push({ gameId: claim.gameId, ok: false, code: "SERVICE_UNAVAILABLE" });
      } finally {
        await releaseClaim(admin, claim);
      }
    }

    return json({ ok: true, claimed: claims.length, results });
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST" }, 400);
  }
});
