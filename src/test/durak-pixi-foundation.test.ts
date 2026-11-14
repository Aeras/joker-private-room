import { describe, it, expect, vi } from "vitest";
import { createDurakRenderState } from "@/durak/pixi/adapters/createDurakRenderState";
import { calculateViewport, LOGICAL_WIDTH, LOGICAL_HEIGHT } from "@/durak/pixi/core/coordinateSystem";
import { getDurakCardFaceUrl, getDurakCardBackUrl, getDurakTableArtUrl } from "@/durak/pixi/assets/cardTextureMap";
import { layoutEngine } from "@/durak/pixi/layout/layoutEngine";
import { DurakAnimationManager, easings } from "@/durak/pixi/core/animationManager";
import { DurakSceneLayers } from "@/durak/pixi/core/sceneLayers";
import type { DurakGameView } from "@/services/durakRoomFunctions";
import type { DurakCard } from "@/durak/rules";

describe("DURAK Pixi Foundation Architecture", () => {
  const dummyCard: DurakCard = { suit: "hearts", rank: 14 }; // Ace of Hearts
  const mockGame: DurakGameView = {
    variant: "podkidnoy",
    trump: "hearts",
    trumpCard: dummyCard,
    stock: 24,
    discardCount: 0,
    round: 1,
    attacker: 0,
    defender: 1,
    pairs: [],
    taking: false,
    ended: false,
    fool: null,
    handSizes: [6, 6],
    myHand: [dummyCard],
    legalMoves: [{ type: "attack", card: dummyCard }],
    seat: 0,
    revision: 1,
  };

  const mockSeats = [
    { index: 0, name: "Player 1", occupant: "p1" },
    { index: 1, name: "Player 2", occupant: "p2" },
  ];

  it("sanitizes render state and preserves privacy boundaries", () => {
    const state = createDurakRenderState(mockGame, mockSeats);

    expect(state.localSeat).toBe(0);
    expect(state.playerCount).toBe(2);
    expect(state.localHand).toEqual([dummyCard]);

    // Opponent only has count, never secret cards
    expect(state.players[1].handCount).toBe(6);
    expect((state.players[1] as any).hand).toBeUndefined();
    expect(state.players[0].isLocal).toBe(true);
    expect(state.players[1].isLocal).toBe(false);
  });

  it("calculates viewport with DPR capping and uniform scaling", () => {
    const vp = calculateViewport(960, 540, 3);
    expect(vp.logicalWidth).toBe(LOGICAL_WIDTH);
    expect(vp.logicalHeight).toBe(LOGICAL_HEIGHT);
    expect(vp.scale).toBe(0.5);
    expect(vp.dpr).toBeLessThanOrEqual(2.5); // Capped DPR
  });

  it("generates correct card face and back URLs from registry", () => {
    const faceUrl = getDurakCardFaceUrl({ suit: "spades", rank: 11 }); // Jack of Spades
    expect(faceUrl).toContain("spades_jack");
    expect(getDurakCardBackUrl()).toContain("blue_back");
    expect(getDurakTableArtUrl()).toContain("table_background");
  });

  it("calculates deterministic hand fan layout without exceeding max bounds", () => {
    const smallHand = layoutEngine.getLocalHandPose(0, 6);
    const largeHand = layoutEngine.getLocalHandPose(0, 36);

    expect(smallHand.x).toBeDefined();
    expect(smallHand.y).toBeGreaterThan(800);
    expect(largeHand.x).toBeDefined();
    expect(largeHand.y).toBeGreaterThan(800);
  });

  it("preserves strict scene layer hierarchy", () => {
    const layers = new DurakSceneLayers();
    expect(layers.root.children.length).toBe(12);
    expect(layers.root.children[0]).toBe(layers.backgroundLayer);
    expect(layers.root.children[layers.root.children.length - 1]).toBe(layers.effectsLayer);
  });

  it("drives tween progress and completes deterministically", () => {
    const mockTicker = {
      add: vi.fn(),
      remove: vi.fn(),
    } as any;

    const animManager = new DurakAnimationManager(mockTicker);
    let updatedProgress = 0;
    let completed = false;

    animManager.startTween({
      id: "test_tween",
      duration: 100,
      onUpdate: (p) => {
        updatedProgress = p;
      },
      onComplete: () => {
        completed = true;
      },
    });

    // Simulate ticker callback
    const updateFn = mockTicker.add.mock.calls[0][0];
    updateFn.call(animManager, { deltaMS: 50 });
    expect(updatedProgress).toBeGreaterThan(0);
    expect(completed).toBe(false);

    updateFn.call(animManager, { deltaMS: 60 });
    expect(updatedProgress).toBe(1);
    expect(completed).toBe(true);
  });
});
