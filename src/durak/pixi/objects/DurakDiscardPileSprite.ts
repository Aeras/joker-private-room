import { Container, Sprite, Text, TextStyle, Graphics } from "pixi.js";
import type { DurakTextureManager } from "../core/textureManager";
import { discardLanding } from "@/durak/discardGeometry";
import { CARD_WIDTH, CARD_HEIGHT } from "./DurakCardSprite";

export class DurakDiscardPileSprite extends Container {
  private mound: Container;
  private countBadge: Container;
  private countText: Text;
  private textureManager: DurakTextureManager;

  constructor(textureManager: DurakTextureManager) {
    super();
    this.textureManager = textureManager;

    this.mound = new Container();
    this.addChild(this.mound);

    // Count badge
    this.countBadge = new Container();
    const bg = new Graphics();
    bg.roundRect(-22, -14, 44, 28, 14);
    bg.fill({ color: 0x000000, alpha: 0.75 });
    bg.stroke({ color: 0xffffff, width: 1.5, alpha: 0.5 });
    this.countBadge.addChild(bg);

    const style = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 16,
      fontWeight: "bold",
      fill: 0xffffff,
    });
    this.countText = new Text({ text: "0", style });
    this.countText.anchor.set(0.5);
    this.countBadge.addChild(this.countText);
    this.countBadge.position.set(0, CARD_HEIGHT / 2 + 20);
    this.addChild(this.countBadge);
  }

  update(count: number): void {
    if (count <= 0) {
      this.visible = false;
      return;
    }

    this.visible = true;
    this.mound.removeChildren();

    const visibleCount = Math.min(count, 20);
    const startIndex = Math.max(0, count - 20);

    for (let i = 0; i < visibleCount; i++) {
      const index = startIndex + i;
      const { x, y, angle } = discardLanding(index);

      const card = new Sprite(this.textureManager.getCardBackTexture());
      card.anchor.set(0.5);
      card.width = CARD_WIDTH;
      card.height = CARD_HEIGHT;
      card.position.set(x, y);
      card.rotation = (angle * Math.PI) / 180;
      this.mound.addChild(card);
    }

    this.countText.text = String(count);
  }
}
