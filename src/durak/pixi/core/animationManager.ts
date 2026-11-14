import { Ticker } from "pixi.js";

export type EasingFunction = (t: number) => number;

export const easings = {
  linear: (t: number) => t,
  easeInCubic: (t: number) => t * t * t,
  easeOutCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeOutBack: (t: number) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export type TweenConfig = {
  id: string;
  duration: number; // in ms
  easing?: EasingFunction;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
};

type ActiveTween = {
  id: string;
  duration: number;
  elapsed: number;
  easing: EasingFunction;
  onUpdate: (progress: number) => void;
  onComplete?: () => void;
};

export class DurakAnimationManager {
  private tweens = new Map<string, ActiveTween>();
  private ticker: Ticker;
  private isReducedMotion = false;

  constructor(ticker: Ticker) {
    this.ticker = ticker;
    this.ticker.add(this.update, this);
    if (typeof window !== "undefined") {
      this.isReducedMotion =
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    }
  }

  setReducedMotion(enabled: boolean): void {
    this.isReducedMotion = enabled;
  }

  startTween(config: TweenConfig): void {
    if (this.isReducedMotion || config.duration <= 0) {
      config.onUpdate(1);
      config.onComplete?.();
      return;
    }

    this.tweens.set(config.id, {
      id: config.id,
      duration: config.duration,
      elapsed: 0,
      easing: config.easing || easings.easeOutCubic,
      onUpdate: config.onUpdate,
      onComplete: config.onComplete,
    });
  }

  cancelTween(id: string): void {
    this.tweens.delete(id);
  }

  cancelAll(): void {
    this.tweens.clear();
  }

  private update(ticker: Ticker): void {
    const deltaMs = ticker.deltaMS;
    if (this.tweens.size === 0) return;

    for (const [id, tween] of this.tweens.entries()) {
      tween.elapsed += deltaMs;
      const rawProgress = Math.min(1, tween.elapsed / tween.duration);
      const easedProgress = tween.easing(rawProgress);

      tween.onUpdate(easedProgress);

      if (rawProgress >= 1) {
        this.tweens.delete(id);
        tween.onComplete?.();
      }
    }
  }

  destroy(): void {
    this.ticker.remove(this.update, this);
    this.tweens.clear();
  }
}
