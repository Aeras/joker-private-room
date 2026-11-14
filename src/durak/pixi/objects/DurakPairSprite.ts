import { Container, Graphics } from "pixi.js";
import type { DurakPair } from "@/durak/engine";
import type { DurakTextureManager } from "../core/textureManager";
import { DurakCardSprite, CARD_WIDTH, CARD_HEIGHT } from "./DurakCardSprite";

export class DurakPairSprite extends Container {
  readonly pairIndex: number;
  private attackSprite: DurakCardSprite | null = null;
  private defenseSprite: DurakCardSprite | null = null;
  private targetOutline: Graphics;
  private textureManager: DurakTextureManager;

  constructor(pairIndex: number, textureManager: DurakTextureManager) {
    super();
    this.pairIndex = pairIndex;
    this.textureManager = textureManager;

    // Interactive target outline
    this.targetOutline = new Graphics();
    this.targetOutline.roundRect(-CARD_WIDTH / 2 - 6, -CARD_HEIGHT / 2 - 6, CARD_WIDTH + 12, CARD_HEIGHT + 36, 16);
    this.targetOutline.stroke({ color: 0xf5c15d, width: 3, alpha: 0.9 });
    this.targetOutline.visible = false;
    this.addChild(this.targetOutline);
  }

  update(pair: DurakPair, isTarget = false): void {
    this.targetOutline.visible = isTarget;

    // Attack card
    if (!this.attackSprite || this.attackSprite.card.suit !== pair.attack.suit || this.attackSprite.card.rank !== pair.attack.rank) {
      if (this.attackSprite) this.removeChild(this.attackSprite);
      this.attackSprite = new DurakCardSprite(pair.attack, this.textureManager, true);
      this.addChildAt(this.attackSprite, 1);
    }

    // Defense card
    if (pair.defense) {
      if (!this.defenseSprite || this.defenseSprite.card.suit !== pair.defense.suit || this.defenseSprite.card.rank !== pair.defense.rank) {
        if (this.defenseSprite) this.removeChild(this.defenseSprite);
        this.defenseSprite = new DurakCardSprite(pair.defense, this.textureManager, true);
        // Slight offset and tilt to look naturally played on top
        this.defenseSprite.position.set(16, 22);
        this.defenseSprite.rotation = (6 * Math.PI) / 180;
        this.addChild(this.defenseSprite);
      }
    } else if (this.defenseSprite) {
      this.removeChild(this.defenseSprite);
      this.defenseSprite = null;
    }
  }
}
