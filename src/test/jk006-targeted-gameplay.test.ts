import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEALER_SELECTION_CARD_TRAVEL_MS,
  DEALER_SELECTION_STAGGER_MS,
  dealerSelectionRecipient,
} from "@/components/table/dealerSelectionPresentationModel";
import { NORMAL_DEAL_STAGGER_MS } from "@/components/table/dealPresentationModel";
import { NORMAL_TRICK_HOLD_MS, NORMAL_TRICK_PLAY_SPACING_MS } from "@/components/table/trickPresentationModel";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 targeted gameplay timing and termination", () => {
  it("uses the requested readable presentation pacing", () => {
    expect(DEALER_SELECTION_STAGGER_MS).toBe(350);
    expect(DEALER_SELECTION_CARD_TRAVEL_MS).toBe(340);
    expect(NORMAL_DEAL_STAGGER_MS).toBe(350);
    expect(NORMAL_TRICK_PLAY_SPACING_MS).toBe(500);
    expect(NORMAL_TRICK_HOLD_MS).toBe(850);
  });

  it("preserves cyclic dealer-selection recipients from the canonical random start seat", () => {
    expect([0, 1, 2, 3, 4, 5].map((index) => dealerSelectionRecipient(2, index))).toEqual([2, 3, 0, 1, 2, 3]);
  });

  it("separates lobby Start, human readiness, host Play, presentation, and gameplay", () => {
    const room = read("src/services/roomFunctions.ts");
    const dealerServer = read("src/server/dealerBootstrap.ts");
    const dealerDomain = read("src/domain/dealerBootstrap.ts");
    const route = read("src/routes/table.tsx");
    const migration = read("supabase/migrations/20261005003230_jk006_ready_play_barrier.sql");

    expect(room).toContain("ensureInitialDealerBootstrapPrepared");
    expect(room).not.toContain("advanceGameUntilBlocked(result.gameId)");
    expect(dealerServer).toContain("resolveInitialDealerBootstrap");
    expect(dealerServer).toContain("activateInitialDealAfterPresentation");
    expect(dealerDomain).toContain('phase: "DEAL_SETUP"');
    expect(dealerDomain).toContain('currentActorSeat: null');
    expect(dealerDomain).toContain('currentHumanDeadline: null');
    expect(route).toContain("getProjectedGameReadiness");
    expect(route).toContain("setProjectedGameReady");
    expect(route).toContain("startProjectedGame");
    expect(route).toContain("completeProjectedStartPresentation");
    expect(route).toContain("readiness.allReady");
    expect(migration).toContain("authorize_game_start_internal");
    expect(migration).toContain("PLAYERS_NOT_READY");
    expect(migration).toContain("presentation_complete");
    expect(migration).toContain("v_phase in ('INITIAL_DEALER_SELECTION', 'DEAL_SETUP') then return null");
  });

  it("keeps private hands and legal actions hidden throughout the startup barriers", () => {
    const projection = read("src/domain/projection.ts");
    const deal = read("src/components/table/DealPresentation.tsx");
    expect(projection).toContain('state.progression.phase === "INITIAL_DEALER_SELECTION" || state.progression.phase === "DEAL_SETUP"');
    expect(projection).toContain('if (state.lifecycle !== "active") return []');
    expect(deal).toContain('projection.progression.phase === "DEAL_SETUP"');
  });

  it("keeps declaration choice optimistic while retaining recovery on failed command", () => {
    const table = read("src/components/table/GameTable.tsx");
    expect(table).toContain("setPendingDeclarationValue(value)");
    expect(table).toContain("if (!result) setPendingDeclarationValue(null)");
    expect(table).toContain("pendingDeclarationValue == null");
  });

  it("uses a bounded sequential committed-play presentation queue", () => {
    const trick = read("src/components/table/TrickPresentation.tsx");
    expect(trick).toContain("queueRef");
    expect(trick).toContain("pendingCompletion");
    expect(trick).toContain("deferredCurrent");
    expect(trick).toContain("playSpacingMs");
    expect(trick).toContain("projection.cards.completedTricks");
  });

  it("continues local flight immediately and supports server rejection rollback", () => {
    const model = read("src/components/table/localPlayPresentation.ts");
    const trick = read("src/components/table/TrickPresentation.tsx");
    expect(model).toContain('status: "submitted" | "accepted" | "rejected"');
    expect(model).toContain("completedTricks.some");
    expect(trick).toContain('presentation.status === "rejected"');
    expect(trick).toContain("setAtTarget(true)");
  });

  it("keeps fullscreen utilities inside the fullscreen root and chat in safe area", () => {
    const route = read("src/routes/table.tsx");
    const table = read("src/components/table/GameTable.tsx");
    const messaging = read("src/components/table/TableMessaging.tsx");
    expect(route).toContain('id="table-fullscreen-root"');
    expect(table).toContain('document.getElementById("table-fullscreen-root")');
    expect(messaging).toContain("safe-area-inset-right");
    expect(messaging).toContain("safe-area-inset-bottom");
  });

  it("implements host-only atomic termination without fabricated scores or history", () => {
    const migration = read("supabase/migrations/20261004225711_jk006_host_forced_termination.sql");
    expect(migration).toContain("terminate_game_by_host_internal");
    expect(migration).toContain("v_host_player_id <> v_player_id");
    expect(migration).toContain("'NOT_HOST'");
    expect(migration).toContain("status = 'completed'");
    expect(migration).toContain("final_score = null");
    expect(migration).toContain("final_placement = null");
    expect(migration).toContain("next_wakeup_at = null");
    expect(migration).toContain("delete from private.game_reconciliation_claims");
    expect(migration).not.toContain("insert into public.game_history");
  });

  it("keeps active-game lookup lifecycle-aware after forced termination", () => {
    const lookup = read("supabase/migrations/20261004213032_jk005_harden_active_game_lookup.sql");
    expect(lookup).toContain("gp.status = 'active'");
    expect(lookup).toContain("g.lifecycle in ('starting', 'active')");
  });

  it("keeps forced termination server-authorized through the Edge boundary", () => {
    const edge = read("supabase/functions/game-state/index.ts");
    const service = read("src/server/gamePersistence.ts");
    expect(edge).toContain('action === "terminate"');
    expect(edge).toContain('commandType !== "host_end_game"');
    expect(edge).toContain('rpcName = "terminate_game_by_host_internal"');
    expect(service).toContain("terminateCanonicalGameByHost");
  });
});
