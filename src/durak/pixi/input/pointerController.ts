import { FederatedPointerEvent, Point } from "pixi.js";
import type { DurakCard } from "@/durak/rules";
import type { DurakCardSprite } from "../objects/DurakCardSprite";
import type { DurakInputCallbacks } from "../types/sceneEvents";
import type { DurakAnimationManager } from "../core/animationManager";
import type { CardLayoutPose } from "../layout/layoutEngine";

const DRAG_THRESHOLD = 8;

export class DurakPointerController {
  private callbacks: DurakInputCallbacks;
  private animationManager: DurakAnimationManager;
  private activeDragSprite: DurakCardSprite | null = null;
  private dragOriginPose: CardLayoutPose | null = null;
  private pointerStartPos = new Point();
  private isDragging = false;
  private isLocked = false;

  constructor(callbacks: DurakInputCallbacks, animationManager: DurakAnimationManager) {
    this.callbacks = callbacks;
    this.animationManager = animationManager;
  }

  setLocked(locked: boolean): void {
    this.isLocked = locked;
  }

  attachCardEvents(sprite: DurakCardSprite, card: DurakCard, getHomePose: () => CardLayoutPose): void {
    sprite.eventMode = "static";
    sprite.cursor = "pointer";

    sprite.on("pointerdown", (e: FederatedPointerEvent) => {
      if (this.isLocked) return;
      this.pointerStartPos.set(e.global.x, e.global.y);
      this.activeDragSprite = sprite;
      this.dragOriginPose = getHomePose();
      this.isDragging = false;
    });

    sprite.on("globalpointermove", (e: FederatedPointerEvent) => {
      if (!this.activeDragSprite || this.activeDragSprite !== sprite) return;

      const dx = e.global.x - this.pointerStartPos.x;
      const dy = e.global.y - this.pointerStartPos.y;

      if (!this.isDragging && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        this.isDragging = true;
        sprite.setVisualState({ isDragging: true });
      }

      if (this.isDragging && this.dragOriginPose) {
        sprite.position.set(this.dragOriginPose.x + dx, this.dragOriginPose.y + dy);
      }
    });

    const finishGesture = (e: FederatedPointerEvent) => {
      if (!this.activeDragSprite || this.activeDragSprite !== sprite) return;

      if (this.isDragging) {
        // Drag release: check if dropped in table center (battle zone)
        const currentY = sprite.position.y;
        if (currentY < 750) {
          // Dropped in play area!
          this.callbacks.onDropCard(card);
        } else if (this.dragOriginPose) {
          // Snap back to home position
          const home = this.dragOriginPose;
          const startX = sprite.position.x;
          const startY = sprite.position.y;

          this.animationManager.startTween({
            id: `snap_back_${card.suit}_${card.rank}`,
            duration: 220,
            onUpdate: (progress) => {
              sprite.position.x = startX + (home.x - startX) * progress;
              sprite.position.y = startY + (home.y - startY) * progress;
            },
            onComplete: () => {
              sprite.position.set(home.x, home.y);
              sprite.rotation = home.rotation;
              sprite.setVisualState({ isDragging: false });
            },
          });
        }
      } else {
        // Clean tap/click
        this.callbacks.onPlayCard(card);
      }

      this.activeDragSprite = null;
      this.dragOriginPose = null;
      this.isDragging = false;
    };

    sprite.on("pointerup", finishGesture);
    sprite.on("pointerupoutside", finishGesture);
  }
}
