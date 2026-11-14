import { Container, Graphics, Sprite, Text, TextStyle, Assets, Texture } from "pixi.js";
import type { DurakPlayerRenderState } from "../types/renderState";
import { CARD_WIDTH, CARD_HEIGHT } from "./DurakCardSprite";
import type { DurakTextureManager } from "../core/textureManager";

export class DurakPlayerSeatSprite extends Container {
  readonly seat: number;
  private avatarContainer: Container;
  private avatarSprite: Sprite;
  private avatarMask: Graphics;
  private border: Graphics;
  private nameText: Text;
  private roleBadge: Container;
  private roleText: Text;
  private handBacks: Container;
  private handCountBadge: Container;
  private handCountText: Text;
  private textureManager: DurakTextureManager;

  constructor(seat: number, textureManager: DurakTextureManager) {
    super();
    this.seat = seat;
    this.textureManager = textureManager;

    // Avatar
    this.avatarContainer = new Container();
    this.avatarSprite = new Sprite(Texture.WHITE);
    this.avatarSprite.anchor.set(0.5);
    this.avatarSprite.width = 64;
    this.avatarSprite.height = 64;

    this.avatarMask = new Graphics();
    this.avatarMask.circle(0, 0, 32);
    this.avatarMask.fill(0xffffff);
    this.avatarSprite.mask = this.avatarMask;

    this.border = new Graphics();
    this.border.circle(0, 0, 33);
    this.border.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });

    this.avatarContainer.addChild(this.avatarMask, this.avatarSprite, this.border);
    this.addChild(this.avatarContainer);

    // Name text
    const nameStyle = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xffffff,
    });
    this.nameText = new Text({ text: "", style: nameStyle });
    this.nameText.anchor.set(0.5, 0);
    this.nameText.position.set(0, 38);
    this.addChild(this.nameText);

    // Role badge
    this.roleBadge = new Container();
    const roleBg = new Graphics();
    roleBg.roundRect(-28, -10, 56, 20, 10);
    roleBg.fill({ color: 0x000000, alpha: 0.8 });
    this.roleBadge.addChild(roleBg);

    const roleStyle = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 11,
      fontWeight: "bold",
      fill: 0xf5c15d,
    });
    this.roleText = new Text({ text: "", style: roleStyle });
    this.roleText.anchor.set(0.5);
    this.roleBadge.addChild(this.roleText);
    this.roleBadge.position.set(0, -38);
    this.roleBadge.visible = false;
    this.addChild(this.roleBadge);

    // Opponent cards container
    this.handBacks = new Container();
    this.addChild(this.handBacks);

    // Hand count badge
    this.handCountBadge = new Container();
    const countBg = new Graphics();
    countBg.roundRect(-16, -10, 32, 20, 10);
    countBg.fill({ color: 0x1f2937, alpha: 0.9 });
    countBg.stroke({ color: 0xf5c15d, width: 1.5 });
    this.handCountBadge.addChild(countBg);

    const countStyle = new TextStyle({
      fontFamily: "sans-serif",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xffffff,
    });
    this.handCountText = new Text({ text: "0", style: countStyle });
    this.handCountText.anchor.set(0.5);
    this.handCountBadge.addChild(this.handCountText);
    this.handCountBadge.visible = false;
    this.addChild(this.handCountBadge);
  }

  update(player: DurakPlayerRenderState): void {
    this.nameText.text = player.displayName;

    // Active border highlight
    this.border.clear();
    if (player.isActive) {
      this.border.circle(0, 0, 34);
      this.border.stroke({ color: 0xf5c15d, width: 3, alpha: 1 });
    } else {
      this.border.circle(0, 0, 33);
      this.border.stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
    }

    // Role badge
    if (player.role === "attacker") {
      this.roleBadge.visible = true;
      this.roleText.text = "Επίθεση";
    } else if (player.role === "defender") {
      this.roleBadge.visible = true;
      this.roleText.text = "Άμυνα";
    } else {
      this.roleBadge.visible = false;
    }

    // Opponent hand card backs (only if not local player)
    if (!player.isLocal) {
      this.handBacks.removeChildren();
      const visibleCount = Math.min(player.handCount, 6);
      const cardW = CARD_WIDTH * 0.55;
      const cardH = CARD_HEIGHT * 0.55;

      for (let i = 0; i < visibleCount; i++) {
        const back = new Sprite(this.textureManager.getCardBackTexture());
        back.anchor.set(0.5);
        back.width = cardW;
        back.height = cardH;
        back.position.set((i - (visibleCount - 1) / 2) * 14, 76);
        this.handBacks.addChild(back);
      }

      this.handCountBadge.visible = player.handCount > 0;
      this.handCountBadge.position.set(0, 114);
      this.handCountText.text = String(player.handCount);
    } else {
      this.handBacks.visible = false;
      this.handCountBadge.visible = false;
    }

    // Lazy load avatar image if URL is provided
    if (player.avatarUrl) {
      Assets.load<Texture>(player.avatarUrl)
        .then((tex) => {
          if (tex) this.avatarSprite.texture = tex;
        })
        .catch(() => {
          // Keep white fallback
        });
    }
  }
}
