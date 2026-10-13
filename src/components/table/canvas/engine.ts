import { MotionScheduler } from "./scheduler";
import {
  browserFrames,
  validPose,
  type CardSprite,
  type FrameDriver,
  type SpritePose,
} from "./types";
/** Bounded Canvas 2D layer; supplied bitmaps are already authorized by the adapter. */
export class CardCanvasEngine {
  private sprites = new Map<string, CardSprite>();
  private scheduler: MotionScheduler;
  private disposed = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private lastFrame: number | null = null;
  private paused = false;
  private batchDepth = 0;
  private dirty = false;
  private counters = { frames: 0, maxFrameGapMs: 0, draws: 0, paintMs: 0 };
  constructor(
    private canvas: HTMLCanvasElement,
    private context: CanvasRenderingContext2D,
    fail: (error: unknown) => void,
    private driver: FrameDriver = browserFrames,
  ) {
    this.scheduler = new MotionScheduler(
      driver,
      (poses, time) => {
        if (this.lastFrame != null)
          this.counters.maxFrameGapMs = Math.max(
            this.counters.maxFrameGapMs,
            time - this.lastFrame,
          );
        this.lastFrame = time;
        this.counters.frames++;
        for (const [id, pose] of poses) {
          const sprite = this.sprites.get(id);
          if (sprite) sprite.pose = pose;
        }
        this.draw();
      },
      fail,
    );
  }
  resize(width: number, height: number, ratio: number) {
    if (![width, height, ratio].every(Number.isFinite) || width <= 0 || height <= 0)
      throw new Error("INVALID_CANVAS_SIZE");
    const previousWidth = this.width;
    const previousHeight = this.height;
    const previousDpr = this.dpr;
    this.width = width;
    this.height = height;
    // Cap both DPR and total backing-store area (about 16MiB RGBA at most).
    this.dpr = Math.min(2, Math.max(0.1, ratio), Math.sqrt(4_000_000 / (width * height)));
    const backingWidth = Math.round(width * this.dpr);
    const backingHeight = Math.round(height * this.dpr);
    if (this.canvas.width !== backingWidth) this.canvas.width = backingWidth;
    if (this.canvas.height !== backingHeight) this.canvas.height = backingHeight;
    if (previousWidth !== width || previousHeight !== height || previousDpr !== this.dpr)
      this.invalidate();
  }
  batch(update: () => void) {
    this.batchDepth++;
    try {
      update();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.dirty) {
        this.dirty = false;
        this.draw();
      }
    }
  }
  private invalidate() {
    if (this.batchDepth > 0) this.dirty = true;
    else this.draw();
  }
  set(sprite: CardSprite) {
    if (this.disposed) return;
    if (!validPose(sprite.pose) || (!this.sprites.has(sprite.id) && this.sprites.size >= 64))
      throw new Error("INVALID_SPRITE_BUDGET");
    this.sprites.set(sprite.id, sprite);
    this.invalidate();
  }
  pose(id: string) {
    const pose = this.sprites.get(id)?.pose;
    return pose ? { ...pose } : null;
  }
  animate(id: string, duration: number, sample: (t: number) => SpritePose, complete: () => void) {
    if (!this.sprites.has(id)) throw new Error("UNKNOWN_SPRITE_OWNER");
    if (this.scheduler.activeCount === 0) this.lastFrame = null;
    this.scheduler.animate(id, duration, sample, complete);
  }
  remove(id: string) {
    this.scheduler.cancel(id);
    this.sprites.delete(id);
    this.invalidate();
  }
  cancelMotion(id: string) {
    this.scheduler.cancel(id);
  }
  metrics() {
    return { ...this.counters };
  }
  suspend() {
    this.paused = true;
    this.lastFrame = null;
    this.scheduler.suspend();
  }
  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.lastFrame = null;
    this.scheduler.resume();
  }
  dispose() {
    this.disposed = true;
    this.scheduler.dispose();
    this.sprites.clear();
    try {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    } catch {
      /* A lost context is already visually detached. */
    }
  }
  private draw() {
    if (this.disposed) return;
    const started = this.driver.now();
    this.counters.draws++;
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    for (const sprite of [...this.sprites.values()].sort(
      (a, b) => (a.pose.layer ?? a.layer) - (b.pose.layer ?? b.layer),
    )) {
      const p = sprite.pose;
      if (!validPose(p)) throw new Error("INVALID_SPRITE_POSE");
      const radius = Math.hypot(p.width, p.height) / 2 + 16;
      if (
        this.width > 0 &&
        this.height > 0 &&
        (p.x + radius < 0 ||
          p.y + radius < 0 ||
          p.x - radius > this.width ||
          p.y - radius > this.height)
      )
        continue;
      ctx.save();
      try {
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        const side = Math.cos((p.flip * Math.PI) / 180);
        ctx.scale(Math.max(0.001, Math.abs(side)), 1);
        const left = -p.width / 2,
          top = -p.height / 2,
          cornerRadius = Math.min(8, p.width * 0.1);
        ctx.shadowColor = p.emphasis ? "rgba(212,175,55,.9)" : "rgba(0,0,0,.28)";
        ctx.shadowBlur = p.emphasis ? 14 : 9;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(left + cornerRadius, top);
        ctx.lineTo(left + p.width - cornerRadius, top);
        ctx.quadraticCurveTo(left + p.width, top, left + p.width, top + cornerRadius);
        ctx.lineTo(left + p.width, top + p.height - cornerRadius);
        ctx.quadraticCurveTo(
          left + p.width,
          top + p.height,
          left + p.width - cornerRadius,
          top + p.height,
        );
        ctx.lineTo(left + cornerRadius, top + p.height);
        ctx.quadraticCurveTo(left, top + p.height, left, top + p.height - cornerRadius);
        ctx.lineTo(left, top + cornerRadius);
        ctx.quadraticCurveTo(left, top, left + cornerRadius, top);
        ctx.closePath();
        ctx.fill();
        ctx.clip();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        const blend = sprite.backImage ? (p.backBlend ?? 0) : 0;
        ctx.globalAlpha = p.opacity * (1 - blend);
        ctx.drawImage(
          side < 0 && sprite.backImage ? sprite.backImage : sprite.image,
          left,
          top,
          p.width,
          p.height,
        );
        if (blend > 0 && sprite.backImage) {
          ctx.globalAlpha = p.opacity * blend;
          ctx.drawImage(sprite.backImage, left, top, p.width, p.height);
        }
        if (p.shade) {
          ctx.globalAlpha = p.opacity * p.shade;
          ctx.fillStyle = "#000";
          ctx.fill();
        }
      } finally {
        ctx.restore();
      }
    }
    this.counters.paintMs += Math.max(0, this.driver.now() - started);
  }
}
