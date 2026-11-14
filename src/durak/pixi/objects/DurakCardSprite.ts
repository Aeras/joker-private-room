import { Container, Sprite, Texture, Graphics } from "pixi.js";
import type { DurakCard } from "@/durak/rules";
import type { DurakTextureManager } from "../core/textureManager";

export const CARD_WIDTH = 120;
export const CARD_HEIGHT = 168; // 5:7 ratio

export type CardVisualState = {
  isSelected?: boolean;
  isDragging?: boolean;
  isHovered?: boolean;
  isLegalTarget?: boolean;
};

export class DurakCardSprite extends Container {
  readonly card: DurakCard;
  private sprite: Sprite;
  private shadow: Graphics;
  private glow: Graphics;
  private isFaceUp: boolean;
  private textureManager: DurakTextureManager;

  constructor(card: DurakCard, textureManager: DurakTextureManager, faceUp = true) {
    super();
    this.card = card;
    this.textureManager = textureManager;
    this.isFaceUp = faceUp;

    // Drop shadow graphic
    this.shadow = new Graphics();
    this.shadow.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 10);
    this.shadow.fill({ color: 0x000000, alpha: 0.35 });
    this.shadow.position.set(0, 6);
    this.addChild(this.shadow);

    // Card sprite
    const texture = faceUp
      ? textureManager.getCardFaceTexture(card)
      : textureManager.getCardBackTexture();
    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(0.5);
    this.sprite.width = CARD_WIDTH;
    this.sprite.height = CARD_HEIGHT;
    this.addChild(this.sprite);

    // Target highlight / selection glow
    this.glow = new Graphics();
    this.glow.roundRect(-CARD_WIDTH / 2 - 4, -CARD_HEIGHT / 2 - 4, CARD_WIDTH + 8, CARD_HEIGHT + 8, 14);
    this.glow.stroke({ color: 0xf5c15d, width: 3, alpha: 0.9 });
    this.glow.visible = false;
    this.addChild(this.glow);
  }

  setFaceUp(faceUp: boolean): void {
    if (this.isFaceUp === faceUp) return;
    this.isFaceUp = faceUp;
    this.sprite.texture = faceUp
      ? this.textureManager.getCardFaceTexture(this.card)
      : this.textureManager.getCardBackTexture();
  }

  setVisualState(state: CardVisualState): void {
    if (state.isSelected) {
      this.glow.visible = true;
      this.shadow.position.set(0, 14);
      this.shadow.alpha = 0.5;
    } else if (state.isLegalTarget) {
      this.glow.visible = true;
      this.shadow.position.set(0, 6);
      this.shadow.alpha = 0.35;
    } else {
      this.glow.visible = false;
      this.shadow.position.set(0, 6);
      this.shadow.alpha = 0.35;
    }

    if (state.isDragging) {
      this.alpha = 0.95;
      this.scale.set(1.08);
      this.shadow.position.set(0, 18);
      this.shadow.alpha = 0.6;
    } else {
      this.alpha = 1;
      this.scale.set(1);
    }
  }
}
