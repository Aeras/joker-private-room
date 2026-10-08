import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DEALER_SELECTION_CARD_TRAVEL_MS,
  DEALER_SELECTION_STAGGER_MS,
  DEALER_SELECTION_WINNER_HOLD_MS,
  DEALER_START_CUE_MS,
  dealerSelectionRecipient,
} from "@/components/table/dealerSelectionPresentationModel";
import { NORMAL_DEAL_STAGGER_MS, NORMAL_DEAL_SETTLE_MS, NORMAL_DEAL_TAIL_MS, NORMAL_DEAL_TRAVEL_MS } from "@/components/table/dealPresentationModel";
import {
  NORMAL_TRICK_STACK_MS,
  NORMAL_TRICK_HOLD_MS,
  NORMAL_TRICK_INTER_PLAY_BEAT_MS,
  NORMAL_TRICK_PLAY_SPACING_MS,
  NORMAL_TRICK_SETTLE_MS,
} from "@/components/table/trickPresentationModel";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// The four former presentation source-string checks are replaced by behavioral
// optimization-motion-ownership, optimization-ordered-presentation and
// optimization-responsive-hand tests. Ref/refactor names are not lifecycle guarantees.
describe("JK-006 targeted gameplay timing and termination", () => {
  it("uses the requested readable presentation pacing", () => {
    expect(DEALER_START_CUE_MS).toBe(350);
    expect(DEALER_SELECTION_STAGGER_MS).toBe(350);
    expect(DEALER_SELECTION_CARD_TRAVEL_MS).toBe(308);
    expect(DEALER_SELECTION_WINNER_HOLD_MS).toBe(490);
    expect(NORMAL_DEAL_STAGGER_MS).toBe(350);
    expect(NORMAL_DEAL_TRAVEL_MS).toBe(308);
    expect(NORMAL_DEAL_SETTLE_MS).toBe(1200);
    expect(NORMAL_DEAL_TAIL_MS).toBe(72);
    expect(NORMAL_TRICK_INTER_PLAY_BEAT_MS).toBe(1_000);
    expect(NORMAL_TRICK_PLAY_SPACING_MS).toBe(NORMAL_TRICK_SETTLE_MS + NORMAL_TRICK_INTER_PLAY_BEAT_MS);
    expect(NORMAL_TRICK_SETTLE_MS).toBeGreaterThanOrEqual(300);
    expect(NORMAL_TRICK_HOLD_MS).toBe(850);
    expect(NORMAL_TRICK_STACK_MS).toBeGreaterThanOrEqual(180);
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

  it("uses viewport-centered cross geometry for dealer selection and normal dealing", () => {
    const dealer = read("src/components/table/DealerSelectionPresentation.tsx");
    const deal = read("src/components/table/DealPresentation.tsx");
    const geometry = read("src/components/table/useTableGeometry.ts");
    expect(dealer).toContain("geometry.dealCenter");
    expect(dealer).toContain("geometry.dealTargets[pos]");
    expect(deal).toContain("geometry.dealCenter");
    expect(deal).toContain("geometry.dealTargets[pos]");
    expect(geometry).toContain("viewportHeight: number");
    expect(geometry).toContain("input.viewportHeight / 2");
    expect(geometry).toContain("point.y - feltRect.top");
  });

  it("keeps already dealt cards visible as accumulating per-seat stacks until the sequence completes", () => {
    const dealer = read("src/components/table/DealerSelectionPresentation.tsx");
    const deal = read("src/components/table/DealPresentation.tsx");
    expect(dealer).toContain("stackIndex: Math.floor(index / 4)");
    expect(deal).toContain("stackIndex: Math.floor(index / 4)");
    expect(deal).toContain("const visibleBeats = visibleIndex < 0 ? [] : beats.slice(0, visibleIndex + 1)");
    expect(deal).toContain("new Set(visibleBeats.map(beat => beat.id))");
    expect(deal).toContain("...retainedBeats.filter(beat => !visibleIds.has(beat.id)), ...visibleBeats");
    expect(deal).toContain("cards.map((beat)");
  });


  it("keeps opponent seats fixed, hides new hands during deal barriers, and uses Greek Joker suit wording", () => {
    const table = read("src/components/table/GameTable.tsx");
    const picker = read("src/components/table/JokerChoicePicker.tsx");
    const trump = read("src/components/table/TrumpIndicator.tsx");
    const trick = read("src/components/table/TrickPresentation.tsx");

    expect(table).toContain('showCards={false}');
    expect(table).toContain('projection.progression.phase === "DEAL_PRESENTATION"');
    expect(table).toContain('projection.progression.phase === "NINE_CARD_INITIAL_DEAL_ALL_SEATS"');
    expect(table).toContain('projection.progression.phase === "NINE_CARD_REMAINING_DEAL"');
    expect(table).toContain('trumpSuit={projection.trump.status === "resolved" ? projection.trump.suit : null}');
    for (const source of [table, picker, trump, trick]) {
      expect(source).not.toMatch(/Πίκες|πίκες/);
    }
    expect(picker).toContain('"Θέλω μεγαλύτερο ατού"');
    expect(trick).toContain('trumpSuit === semantic.requestedSuit');
    expect(trick).toContain('"Θέλω μεγαλύτερο ατού"');
  });

  it("shows the 30-second ring only after declarations enter card play", () => {
    const table = read("src/components/table/GameTable.tsx");
    expect(table).toContain('projection.progression.phase === "CARD_PLAY"');
    expect(table).toContain('projection.progression.phase === "JOKER_DECISION"');
    expect(table).toContain("humanDeadline: isActor && countdownPhase ? publicDeadline : null");
  });

  it("does not let browser reduced-motion accelerate dealing", () => {
    const dealer = read("src/components/table/DealerSelectionPresentation.tsx");
    const deal = read("src/components/table/DealPresentation.tsx");
    expect(dealer).toContain("gameplayReducedMotionOverride: false");
    expect(deal).toContain("gameplayReducedMotionOverride: false");
    expect(deal).not.toContain("motion-reduce:duration-75");
  });

  it("returns to the home screen immediately after a successful host end-game", () => {
    const menu = read("src/components/table/TableUtilityMenu.tsx");
    const projectionService = read("src/services/gameProjectionFunctions.ts");
    const migration = read("supabase/migrations/20261005062610_jk006_termination_terminal_payload.sql");
    expect(menu).toContain('window.location.assign("/")');
    expect(projectionService).toContain("terminal.canonicalState");
    expect(migration).toContain("'canonicalState', v_new_state");
    expect(migration).toContain("'viewerSeat', v_viewer_seat");
  });

  it("keeps declaration choice optimistic while retaining recovery on failed command", () => {
    const table = read("src/components/table/GameTable.tsx");
    expect(table).toContain("setPendingDeclarationValue(value)");
    expect(table).toContain("if (!result) setPendingDeclarationValue(null)");
    expect(table).toContain("pendingDeclarationValue == null");
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
