import { describe, expect, it, vi } from "vitest";
import { ProjectionSceneAdapter, projectionScene, localFlightInstruction } from "@/components/table/canvas/projectionAdapter";
import { dispatchPlayIntent } from "@/components/table/canvas/inputAdapter";
import { projectGameForSeat } from "@/domain/projection";
import { reconciliationFixture } from "./fixtures/reconciliationGame";
import { computeTableGeometry } from "@/components/table/useTableGeometry";
import type { LocalPlayPresentation } from "@/components/table/localPlayPresentation";
const geometry = { ...computeTableGeometry({ feltRect: { left: 0, top: 0, width: 844, height: 390, right: 844, bottom: 390 }, viewportWidth: 844, viewportHeight: 390 }), epoch: 1 };
function setup(ruleset: "popular" | "classic" | "minus" = "popular") {
  const p = projectGameForSeat(reconciliationFixture(ruleset), 0);
  const card = { kind: "standard" as const, id: "test-card", suit: "hearts" as const, rank: "A" as const };
  p.cards.ownHand = [card]; p.cards.ownHandVisible = true; p.local.legalActions = [{ type: "play_card", cardIds: [card.id] }]; p.seats[0].controller = "human";
  const token: LocalPlayPresentation = { gameId: p.gameId, dealNumber: p.progression.dealNumber, card, cardId: card.id, actorSeat: 0, sourceStateVersion: p.stateVersion, acceptedStateVersion: null, geometryEpoch: 1, releaseRect: { left: 310, top: 300, width: 65, height: 91, right: 375, bottom: 391, rotation: 4 }, status: "submitted" };
  return { p, token };
}
describe("authorized Canvas adapter", () => {
  it.each(["popular","classic","minus"] as const)("uses the same real local flight in %s with exact endpoints", ruleset => {
    const { p, token } = setup(ruleset), motion = localFlightInstruction(p, token, geometry, false)!;
    expect(motion.duration).toBe(300); expect(motion.sample(0)).toEqual(motion.initial);
    expect(motion.sample(1)).toMatchObject({ x: geometry.trickSlots[0].x, y: geometry.trickSlots[0].y, width: geometry.trickCardSize.width, rotation: 2, opacity: 1 });
    const reduced = localFlightInstruction(p, token, geometry, true)!;
    expect(reduced.duration).toBe(75); expect(Math.abs(reduced.sample(0).y - reduced.sample(1).y)).toBeCloseTo(12);
  });
  it("copies only visible own/public cards, ignoring injected hidden truth", () => {
    const { p } = setup(); const polluted = Object.assign(p, { hiddenHands: [["secret"]], deck: ["future"], sessionToken: "secret" });
    Object.assign(p.cards, { hands: [["secret"]], stock: ["future"] });
    const scene = projectionScene(polluted); expect(JSON.stringify(scene)).not.toMatch(/secret|future|sessionToken|hiddenHands/);
    p.cards.ownHandVisible = false; expect(projectionScene(p).ownHand).toEqual([]);
  });
  it("deduplicates versions, rejects older snapshots and resets explicitly on reconnect", () => {
    const { p } = setup(), adapter = new ProjectionSceneAdapter();
    expect(adapter.ingest(p)).not.toBeNull(); expect(adapter.ingest(p)).toBeNull();
    expect(adapter.ingest({ ...p, stateVersion: p.stateVersion - 1 })).toBeNull();
    adapter.reset(); expect(adapter.ingest(p)).not.toBeNull();
    expect(adapter.ingest({ ...p, gameId: "other" })).not.toBeNull();
  });
  it("rejects other seats/games/future versions, inaccessible faces and all Jokers", () => {
    const { p, token } = setup();
    for (const change of [{ gameId: "other" }, { actorSeat: 1 as const }, { sourceStateVersion: p.stateVersion + 1 }, { card: { kind: "joker" as const, id: "joker-1" } }]) expect(localFlightInstruction(p, { ...token, ...change }, geometry, false)).toBeNull();
    p.cards.ownHandVisible = false; expect(localFlightInstruction(p, token, geometry, false)).toBeNull();
    p.cards.currentTrick = [{ seatIndex: 0, card: token.card }]; expect(localFlightInstruction(p, token, geometry, false)).not.toBeNull();
  });
  it("ignores unresolved Joker table metadata", () => {
    const { p } = setup(); p.cards.currentTrick = [{ seatIndex: 1, card: { kind: "joker", id: "joker-2" } }];
    expect(projectionScene(p).table).toEqual([]);
  });
  it("dispatches only authorized intents through the existing callback and never accepts visually", async () => {
    const { p, token } = setup(), submit = vi.fn(async () => {}), intent = { cardId: token.cardId, release: token.releaseRect };
    expect(await dispatchPlayIntent(p, intent, submit)).toBe(true); expect(submit).toHaveBeenCalledOnce();
    p.local.legalActions = []; expect(await dispatchPlayIntent(p, intent, submit)).toBe(false);
    p.seats[0].controller = "permanent_bot"; expect(await dispatchPlayIntent(p, intent, submit)).toBe(false);
    expect(submit).toHaveBeenCalledOnce(); expect(token.status).toBe("submitted");
  });
});

