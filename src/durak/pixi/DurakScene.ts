import { Container, Sprite, Texture } from "pixi.js";
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

export class DurakScene {
  readonly stage: Container;
  readonly layers: DurakSceneLayers;
  readonly textureManager: DurakTextureManager;
  readonly animationManager: DurakAnimationManager;
  private pointerController: DurakPointerController;

  private tableBackgroundSprite: Sprite;
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

    // Table background
    this.tableBackgroundSprite = new Sprite(Texture.WHITE);
    this.tableBackgroundSprite.width = LOGICAL_WIDTH;
    this.tableBackgroundSprite.height = LOGICAL_HEIGHT;
    this.layers.backgroundLayer.addChild(this.tableBackgroundSprite);

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
    this.tableBackgroundSprite.texture = this.textureManager.getTableTexture();
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
    const stockPos = layoutEngine.getStockPose();
    const seatLayout = DURAK_SEAT_POSITIONS[state.playerCount] || DURAK_SEAT_POSITIONS[2];

    const cardsPerPlayer = 6;
    let cardSeq = 0;

    for (let round = 0; round < cardsPerPlayer; round++) {
      for (const player of state.players) {
        const positionName = seatLayout[player.relativeSeat] || "top";
        const destPose = layoutEngine.getSeatPose(positionName);
        const delay = cardSeq * 180;
        cardSeq++;

        setTimeout(() => {
          if (!this.isDealingActive) return;

          const flightCard = new Sprite(this.textureManager.getCardBackTexture());
          flightCard.anchor.set(0.5);
          flightCard.width = 120;
          flightCard.height = 168;
          flightCard.position.set(stockPos.x, stockPos.y);
          this.layers.animationLayer.addChild(flightCard);

          this.animationManager.startTween({
            id: `deal_card_${round}_${player.seat}`,
            duration: 350,
            onUpdate: (progress) => {
              flightCard.position.x = stockPos.x + (destPose.x - stockPos.x) * progress;
              flightCard.position.y = stockPos.y + (destPose.y - stockPos.y) * progress;
              flightCard.scale.set(1 - 0.25 * progress);
            },
            onComplete: () => {
              this.layers.animationLayer.removeChild(flightCard);
            },
          });
        }, delay);
      }
    }

    const trumpFlipTime = cardSeq * 180 + 200;
    setTimeout(() => {
      if (!this.isDealingActive) return;
      this.stockSprite.update(state.stockCount, state.trumpCard);
    }, trumpFlipTime);

    const handEntranceTime = trumpFlipTime + 650 + 500;
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
