import { Container, Graphics, Sprite, Texture } from "pixi.js";
import type { DurakCard } from "@/durak/rules";
import type { DurakRenderState } from "./types/renderState";
import type { DurakInputCallbacks } from "./types/sceneEvents";
import { DurakSceneLayers } from "./core/sceneLayers";
import { DurakTextureManager } from "./core/textureManager";
import { DurakAnimationManager } from "./core/animationManager";
import { DurakStockSprite } from "./objects/DurakStockSprite";
import { DurakDiscardPileSprite } from "./objects/DurakDiscardPileSprite";
import { DurakPairSprite } from "./objects/DurakPairSprite";
import { DurakPlayerSeatSprite } from "./objects/DurakPlayerSeatSprite";
import { DurakCardSprite } from "./objects/DurakCardSprite";
import { layoutEngine } from "./layout/layoutEngine";
import { DurakPointerController } from "./input/pointerController";
import { DURAK_SEAT_POSITIONS } from "@/durak/rules";
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from "./core/coordinateSystem";
import { playGameSound } from "@/lib/gameAudio";

function createBlueTableGraphics(width: number, height: number): Graphics {
  const g = new Graphics();
  // 1. Full-screen outer ambient dark backdrop
  g.rect(0, 0, width, height);
  g.fill({ color: 0x060c18 });

  // 2. Outer mahogany/walnut rail with rounded corners (covering the screen edge-to-edge)
  const railPadX = 14;
  const railPadY = 10;
  const railW = width - railPadX * 2;
  const railH = height - railPadY * 2;
  const railRadius = 140;

  g.roundRect(railPadX, railPadY, railW, railH, railRadius);
  g.fill({ color: 0x16100b });
  g.stroke({ color: 0x3a2416, width: 6 });

  // 3. Gold beveled inlay rim
  const rimPadX = railPadX + 14;
  const rimPadY = railPadY + 12;
  const rimW = railW - 28;
  const rimH = railH - 24;
  const rimRadius = 124;

  g.roundRect(rimPadX, rimPadY, rimW, rimH, rimRadius);
  g.fill({ color: 0x241810 });
  g.stroke({ color: 0xd4af37, width: 2.5, alpha: 0.65 });

  // 4. Midnight blue casino felt surface
  const feltPadX = rimPadX + 8;
  const feltPadY = rimPadY + 8;
  const feltW = rimW - 16;
  const feltH = rimH - 16;
  const feltRadius = 114;

  g.roundRect(feltPadX, feltPadY, feltW, feltH, feltRadius);
  g.fill({ color: 0x0f2746 }); // Luxury midnight-blue felt
  g.stroke({ color: 0x1a3860, width: 3 });

  // 5. Center felt luminous glow
  g.ellipse(width / 2, height / 2, feltW * 0.44, feltH * 0.40);
  g.fill({ color: 0x184278, alpha: 0.38 });

  // 6. Thin gold racetrack marking line
  const markPadX = feltPadX + 85;
  const markPadY = feltPadY + 70;
  const markW = feltW - 170;
  const markH = feltH - 140;
  const markRadius = 75;

  g.roundRect(markPadX, markPadY, markW, markH, markRadius);
  g.stroke({ color: 0xd4af37, width: 1.8, alpha: 0.22 });

  // 7. Center oval watermark ring
  g.ellipse(width / 2, height / 2, 240, 120);
  g.stroke({ color: 0xd4af37, width: 1.4, alpha: 0.16 });

  // 8. Polished brass studs along the rail (Joker style)
  const studPositions = [
    [width * 0.12, railPadY + 7],
    [width * 0.32, railPadY + 7],
    [width * 0.50, railPadY + 7],
    [width * 0.68, railPadY + 7],
    [width * 0.88, railPadY + 7],
    [width * 0.035, height * 0.5],
    [width * 0.965, height * 0.5],
    [width * 0.12, height - railPadY - 7],
    [width * 0.32, height - railPadY - 7],
    [width * 0.50, height - railPadY - 7],
    [width * 0.68, height - railPadY - 7],
    [width * 0.88, height - railPadY - 7],
  ];

  for (const [sx, sy] of studPositions) {
    g.circle(sx, sy, 7);
    g.fill({ color: 0xd4af37 });
    g.stroke({ color: 0x5a3e10, width: 1.5 });
  }

  return g;
}

export class DurakScene {
  readonly stage: Container;
  readonly layers: DurakSceneLayers;
  readonly textureManager: DurakTextureManager;
  readonly animationManager: DurakAnimationManager;
  private pointerController: DurakPointerController;

  private tableGraphics: Graphics;
  private stockSprite: DurakStockSprite;
  private discardSprite: DurakDiscardPileSprite;
  private seatSprites = new Map<number, DurakPlayerSeatSprite>();
  private pairSprites: DurakPairSprite[] = [];
  private localHandSprites: DurakCardSprite[] = [];
  private selectedCard: DurakCard | null = null;
  private isDealingActive = false;
  private dealingSprites: Sprite[] = [];

  constructor(
    ticker: any,
    callbacks: DurakInputCallbacks
  ) {
    this.stage = new Container();
    this.layers = new DurakSceneLayers();
    this.stage.addChild(this.layers.root);

    this.textureManager = new DurakTextureManager();
    this.animationManager = new DurakAnimationManager(ticker);
    this.pointerController = new DurakPointerController(callbacks, this.animationManager);

    // Fullscreen midnight-blue luxury casino table
    this.tableGraphics = createBlueTableGraphics(LOGICAL_WIDTH, LOGICAL_HEIGHT);
    this.layers.backgroundLayer.addChild(this.tableGraphics);

    // Stock
    this.stockSprite = new DurakStockSprite(this.textureManager);
    const stockPos = layoutEngine.getStockPose();
    this.stockSprite.position.set(stockPos.x, stockPos.y);
    this.layers.stockLayer.addChild(this.stockSprite);

    // Discard
    this.discardSprite = new DurakDiscardPileSprite(this.textureManager);
    const discardPos = layoutEngine.getDiscardPose();
    this.discardSprite.position.set(discardPos.x, discardPos.y);
    this.layers.discardPileLayer.addChild(this.discardSprite);
  }

  async init(): Promise<void> {
    await this.textureManager.preloadAll();
  }

  resizeBackground(width: number, height: number, x: number, y: number): void {
    // Background graphics naturally covers the full logical frame
  }

  render(state: DurakRenderState): void {
    this.pointerController.setLocked(state.isBusy || state.isDealing);

    if (state.isDealing && !this.isDealingActive) {
      this.startOpeningDeal(state);
    } else if (!state.isDealing) {
      this.isDealingActive = false;
    }

    // 1. Update Stock & Trump
    this.stockSprite.update(state.stockCount, state.trumpCard);

    // 2. Update Discard Pile
    this.discardSprite.update(state.discardCount);

    // 3. Update Seats & Players
    const seatLayout = DURAK_SEAT_POSITIONS[state.playerCount] || DURAK_SEAT_POSITIONS[2];
    for (const player of state.players) {
      let seatSprite = this.seatSprites.get(player.seat);
      if (!seatSprite) {
        seatSprite = new DurakPlayerSeatSprite(player.seat, this.textureManager);
        this.seatSprites.set(player.seat, seatSprite);
        this.layers.seatLayer.addChild(seatSprite);
      }

      const positionName = seatLayout[player.relativeSeat] || "top";
      const pose = layoutEngine.getSeatPose(positionName);
      seatSprite.position.set(pose.x, pose.y);
      seatSprite.update(player);
    }

    // 4. Update Battle Center Pairs
    const totalPairs = state.pairs.length;
    // Reconcile pair sprites
    while (this.pairSprites.length < totalPairs) {
      const idx = this.pairSprites.length;
      const pairSprite = new DurakPairSprite(idx, this.textureManager);
      this.pairSprites.push(pairSprite);
      this.layers.battleLayer.addChild(pairSprite);
    }
    while (this.pairSprites.length > totalPairs) {
      const removed = this.pairSprites.pop();
      if (removed) this.layers.battleLayer.removeChild(removed);
    }

    for (let i = 0; i < totalPairs; i++) {
      const pair = state.pairs[i];
      const sprite = this.pairSprites[i];
      const pose = layoutEngine.getBattlePairPose(i, totalPairs);
      sprite.position.set(pose.x, pose.y);
      sprite.update(pair);
    }

    // 5. Update Local Hand Cards
    const hand = state.localHand;
    const handCount = hand.length;

    // Clean up extra hand sprites if hand shrunk
    while (this.localHandSprites.length > handCount) {
      const removed = this.localHandSprites.pop();
      if (removed) this.layers.localHandLayer.removeChild(removed);
    }

    // Reconcile hand sprites
    for (let i = 0; i < handCount; i++) {
      const card = hand[i];
      let cardSprite = this.localHandSprites[i];
      const isSelected = this.selectedCard?.suit === card.suit && this.selectedCard?.rank === card.rank;

      if (!cardSprite || cardSprite.card.suit !== card.suit || cardSprite.card.rank !== card.rank) {
        if (cardSprite) this.layers.localHandLayer.removeChild(cardSprite);
        cardSprite = new DurakCardSprite(card, this.textureManager, true);
        this.localHandSprites[i] = cardSprite;
        this.layers.localHandLayer.addChild(cardSprite);

        // Attach drag & drop / click handler
        this.pointerController.attachCardEvents(cardSprite, card, () =>
          layoutEngine.getLocalHandPose(i, handCount, isSelected)
        );
      }

      const pose = layoutEngine.getLocalHandPose(i, handCount, isSelected);
      cardSprite.position.set(pose.x, pose.y);
      cardSprite.rotation = pose.rotation;
      cardSprite.zIndex = pose.zIndex;
      cardSprite.setVisualState({ isSelected });
    }
  }

  private startOpeningDeal(state: DurakRenderState): void {
    if (this.isDealingActive) return;
    this.isDealingActive = true;

    this.layers.animationLayer.removeChildren();
    const dealerPose = layoutEngine.getDealerPose();
    const stockPos = layoutEngine.getStockPose();
    const seatLayout = DURAK_SEAT_POSITIONS[state.playerCount] || DURAK_SEAT_POSITIONS[2];

    // 1. Dealer stack at bottom-left next to local player avatar with elevated 3D shadow
    const dealerDeck = new Container();
    dealerDeck.position.set(dealerPose.x, dealerPose.y);

    const shadow = new Graphics();
    shadow.ellipse(0, 22, 64, 18);
    shadow.fill({ color: 0x000000, alpha: 0.5 });
    dealerDeck.addChild(shadow);

    for (let s = 0; s < 5; s++) {
      const c = new Sprite(this.textureManager.getCardBackTexture());
      c.anchor.set(0.5);
      c.width = 110;
      c.height = 154;
      c.position.set(s * 0.8, -s * 2.5);
      dealerDeck.addChild(c);
    }
    this.layers.animationLayer.addChild(dealerDeck);

    try {
      playGameSound("shuffle", `deal-${state.round}-${Date.now()}`);
    } catch {}

    const cardsPerPlayer = 6;
    let cardSeq = 0;

    // 2. Sequential rhythmic dealing to all players from dealer deck
    for (let round = 0; round < cardsPerPlayer; round++) {
      for (const player of state.players) {
        const positionName = seatLayout[player.relativeSeat] || "top";
        const destPose = layoutEngine.getSeatPose(positionName);
        const delay = cardSeq * 180;
        cardSeq++;

        setTimeout(() => {
          if (!this.isDealingActive) return;

          try {
            playGameSound("deal", `durak-card-${round}-${player.seat}`);
          } catch {}

          const flightCard = new Sprite(this.textureManager.getCardBackTexture());
          flightCard.anchor.set(0.5);
          flightCard.width = 110;
          flightCard.height = 154;
          flightCard.position.set(dealerPose.x, dealerPose.y);
          this.layers.animationLayer.addChild(flightCard);

          const startX = dealerPose.x;
          const startY = dealerPose.y;
          const targetX = player.isLocal ? LOGICAL_WIDTH / 2 : destPose.x;
          const targetY = player.isLocal ? 990 : destPose.y;
          const dx = targetX - startX;
          const dy = targetY - startY;

          this.animationManager.startTween({
            id: `deal_card_${round}_${player.seat}`,
            duration: 340,
            onUpdate: (progress) => {
              const arc = 4 * progress * (1 - progress);
              flightCard.position.x = startX + dx * progress;
              flightCard.position.y = startY + dy * progress - arc * 70;
              flightCard.scale.set(1 - 0.18 * progress);
            },
            onComplete: () => {
              this.layers.animationLayer.removeChild(flightCard);
            },
          });
        }, delay);
      }
    }

    // 3. Trump card deal & 3D flip (rotates 90 deg and lands on left-center table felt)
    const trumpFlipTime = cardSeq * 180 + 160;
    setTimeout(() => {
      if (!this.isDealingActive) return;

      const trumpFlight = new Sprite(this.textureManager.getCardBackTexture());
      trumpFlight.anchor.set(0.5);
      trumpFlight.width = 110;
      trumpFlight.height = 154;
      trumpFlight.position.set(dealerPose.x, dealerPose.y);
      this.layers.animationLayer.addChild(trumpFlight);

      this.animationManager.startTween({
        id: "deal_trump_flight",
        duration: 520,
        onUpdate: (progress) => {
          trumpFlight.position.x = dealerPose.x + (stockPos.x - dealerPose.x) * progress;
          trumpFlight.position.y = dealerPose.y + (stockPos.y - dealerPose.y) * progress - Math.sin(progress * Math.PI) * 90;
          trumpFlight.rotation = progress * (Math.PI / 2); // 90 degree rotation
          // 3D card flip
          if (progress < 0.5) {
            trumpFlight.scale.x = 1 - progress * 2;
          } else {
            if (state.trumpCard) {
              trumpFlight.texture = this.textureManager.getCardFaceTexture(state.trumpCard);
            }
            trumpFlight.scale.x = (progress - 0.5) * 2;
          }
        },
        onComplete: () => {
          this.layers.animationLayer.removeChild(trumpFlight);
          this.stockSprite.update(state.stockCount, state.trumpCard);
        },
      });
    }, trumpFlipTime);

    // 4. Conclude deal and clean up animation layer
    const handEntranceTime = trumpFlipTime + 650;
    setTimeout(() => {
      this.isDealingActive = false;
      this.layers.animationLayer.removeChildren();
    }, handEntranceTime);
  }

  destroy(): void {
    this.animationManager.destroy();
    this.textureManager.destroy();
    this.layers.destroy();
    this.stage.destroy({ children: true });
  }
}
