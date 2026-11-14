import { Container, Sprite, Text, TextStyle, Graphics } from "pixi.js";
import type { DurakCard } from "@/durak/rules";
import type { DurakTextureManager } from "../core/textureManager";
import { CARD_WIDTH, CARD_HEIGHT } from "./DurakCardSprite";

export class DurakStockSprite extends Container {
  private trumpSprite: Sprite;
  private deckStack: Container;
  private countBadge: Container;
  private countText: Text;
  private textureManager: DurakTextureManager;

  constructor(textureManager: DurakTextureManager) {
    super();
    this.textureManager = textureManager;

    // Trump card lying horizontally (rotated 90 degrees)
    this.trumpSprite = new Sprite(textureManager.getCardBackTexture());
    this.trumpSprite.anchor.set(0.5);
    this.trumpSprite.width = CARD_WIDTH;
    this.trumpSprite.height = CARD_HEIGHT;
    this.trumpSprite.rotation = Math.PI / 2; // 90 deg
    this.addChild(this.trumpSprite);

    // Closed deck stack on top
    this.deckStack = new Container();
    this.addChild(this.deckStack);

    // Count badge
    this.countBadge = new Container();
    const bg = new Graphics();
    bg.roundRect(-22, -14, 44, 28, 14);
    bg.fill({ color: 0x000000, alpha: 0.75 });
    bg.stroke({ color: 0xf5c15d, width: 1.5, alpha: 0.8 });
    this.countBadge.addChild(bg);

    const style = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 16,
      fontWeight: "bold",
      fill: 0xffffff,
    });
    this.countText = new Text({ text: "36", style });
    this.countText.anchor.set(0.5);
    this.countBadge.addChild(this.countText);
    this.countBadge.position.set(0, CARD_HEIGHT / 2 + 20);
    this.addChild(this.countBadge);
  }

  update(stockCount: number, trumpCard?: DurakCard): void {
    if (stockCount <= 0) {
      this.visible = false;
      return;
    }

    this.visible = true;

    // Update trump face
    if (trumpCard) {
      this.trumpSprite.texture = this.textureManager.getCardFaceTexture(trumpCard);
      this.trumpSprite.visible = true;
    }

    // Rebuild visual deck stack
    this.deckStack.removeChildren();
    if (stockCount > 1) {
      const visibleCards = Math.min(stockCount - 1, 5);
      for (let i = 0; i < visibleCards; i++) {
        const back = new Sprite(this.textureManager.getCardBackTexture());
        back.anchor.set(0.5);
        back.width = CARD_WIDTH;
        back.height = CARD_HEIGHT;
        // Subtle offset to look like a physical stack
        back.position.set(i * -1.5, i * -1.5);
        this.deckStack.addChild(back);
      }
      this.deckStack.visible = true;
    } else {
      this.deckStack.visible = false;
    }

    this.countText.text = String(stockCount);
  }
}
