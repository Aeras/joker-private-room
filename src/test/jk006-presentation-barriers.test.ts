import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS } from "@/components/table/DealPresentation";
import {
  NORMAL_TRICK_INTER_PLAY_BEAT_MS,
  NORMAL_TRICK_PLAY_SPACING_MS,
  NORMAL_TRICK_SETTLE_MS,
} from "@/components/table/trickPresentationModel";
import {
  NINE_CARD_INITIAL_PRESENTATION_FALLBACK_MS,
  NINE_CARD_REMAINING_PRESENTATION_FALLBACK_MS,
} from "@/domain/nineCardPresentation";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 presentation barriers", () => {
  it("paces every next visible trick play from prior settle completion", () => {
    expect(NORMAL_TRICK_INTER_PLAY_BEAT_MS).toBe(300);
    expect(NORMAL_TRICK_PLAY_SPACING_MS).toBe(NORMAL_TRICK_SETTLE_MS + 300);
  });

  it("retains Joker semantics as a three-second center presentation event", () => {
    const trick = read("src/components/table/TrickPresentation.tsx");
    const picker = read("src/components/table/JokerChoicePicker.tsx");
    expect(trick).toContain("JOKER_ANNOUNCEMENT_MS = 3_000");
    expect(picker).toContain("Τζόκερ από πάνω");
    expect(picker).toContain("Τζόκερ από κάτω");
    expect(trick).toContain("Θέλω μεγαλύτερο —");
    expect(trick).toContain("Θέλω μεγαλύτερο ατού");
    expect(trick).toContain("Παίρνουν —");
    expect(trick).toContain("data-joker-announcement");
  });

  it("uses real canonical phases as the two nine-card presentation barriers", () => {
    const lifecycle = read("src/server/reconciliationCore.ts");
    const commands = read("src/domain/gameplayCommands.ts");
    const service = read("src/server/nineCardPresentation.ts");
    expect(lifecycle).toContain("holdNineCardInitialDealForPresentation");
    expect(commands).toContain('phase: "NINE_CARD_REMAINING_DEAL"');
    expect(commands).toContain("currentActorSeat: null");
    expect(service).toContain("activateNineCardTrumpChoiceAfterPresentation");
    expect(service).toContain("activateNineCardDeclarationAfterPresentation");
  });

  it("has a durable server fallback when no browser can acknowledge a nine-card stage", () => {
    expect(NINE_CARD_INITIAL_PRESENTATION_FALLBACK_MS).toBe(8_000);
    expect(NINE_CARD_REMAINING_PRESENTATION_FALLBACK_MS).toBe(15_000);
    const state = read("src/domain/gameState.ts");
    const reconciliation = read("src/server/reconciliationCore.ts");
    const migration = read("supabase/migrations/20261005190038_jk006_nine_card_presentation_wake.sql");
    expect(state).toContain("presentationReadyAt?: string | null");
    expect(reconciliation).toContain("PRESENTATION_BARRIER");
    expect(reconciliation).toContain("nineCardPresentationFallbackIsDue");
    expect(reconciliation).toContain("system_nine_card_presentation_fallback");
    expect(migration).toContain("NINE_CARD_INITIAL_DEAL_ALL_SEATS");
    expect(migration).toContain("NINE_CARD_REMAINING_DEAL");
    expect(migration).toContain("presentationReadyAt");
  });

  it("gives the trump announcement a readability beat before remaining cards move", () => {
    expect(NINE_CARD_TRUMP_ANNOUNCEMENT_LEAD_IN_MS).toBe(1_800);
    const table = read("src/components/table/GameTable.tsx");
    expect(table).toContain("TRUMP_ANNOUNCEMENT_MS = 3_000");
    expect(table).toContain("data-trump-announcement");
  });

  it("keeps the approved trump location while supporting suit and no-trump indicators", () => {
    const table = read("src/components/table/GameTable.tsx");
    const indicator = read("src/components/table/TrumpIndicator.tsx");
    expect(table).toContain('left-[72%] top-[10vh]');
    expect(indicator).toContain("Χωρίς ατού");
    expect(indicator).toContain('data-trump-indicator="no-trump"');
    expect(indicator).toContain("exposedTrumpCard");
  });

  it("lets the route acknowledge each nine-card stage without immediately reconciling past it", () => {
    const route = read("src/routes/table.tsx");
    const service = read("src/services/gameProjectionFunctions.ts");
    expect(route).toContain("completeProjectedNineCardPresentation");
    expect(route).toContain("onNineCardPresentationComplete={completeNineCardStage}");
    expect(service).toContain("Do not reconcile again here");
  });
});
