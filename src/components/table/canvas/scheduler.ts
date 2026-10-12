import type { FrameDriver, SpritePose } from "./types";
type Motion = { key: string; generation: number; start: number; duration: number; sample(t: number): SpritePose; complete(): void };
/** Elapsed-time presentation clock. No rules, timers, React state, or command dispatch. */
export class MotionScheduler {
  private motions = new Map<string, Motion>();
  private generations = new Map<string, number>();
  private frame: number | null = null;
  private run = 0;
  private paused = false;
  private disposed = false;
  constructor(private driver: FrameDriver, private paint: (poses: ReadonlyMap<string, SpritePose>) => void, private fail: (error: unknown) => void) {}
  animate(key: string, duration: number, sample: Motion["sample"], complete: () => void) {
    if (this.disposed) return;
    if (!Number.isFinite(duration) || duration < 0 || duration > 5000 || (!this.motions.has(key) && this.motions.size >= 32)) throw new Error("INVALID_MOTION_BUDGET");
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    this.motions.set(key, { key, generation, start: this.driver.now(), duration, sample, complete });
    this.ensureFrame();
  }
  cancel(key: string) { this.motions.delete(key); this.generations.set(key, (this.generations.get(key) ?? 0) + 1); if (!this.motions.size) this.stopFrame(); }
  suspend() { this.paused = true; this.stopFrame(); }
  resume() { if (this.disposed) return; this.paused = false; this.ensureFrame(); }
  dispose() { this.disposed = true; this.stopFrame(); this.motions.clear(); this.generations.clear(); }
  private stopFrame() { this.run++; if (this.frame != null) this.driver.cancel(this.frame); this.frame = null; }
  private ensureFrame() {
    if (this.disposed || this.paused || this.frame != null || !this.motions.size) return;
    const run = this.run;
    this.frame = this.driver.request(time => {
      if (this.disposed || this.paused || run !== this.run) return;
      this.frame = null;
      const poses = new Map<string, SpritePose>(), completed: Motion[] = [];
      try {
        for (const motion of this.motions.values()) {
          const t = motion.duration === 0 ? 1 : Math.max(0, Math.min(1, (time - motion.start) / motion.duration));
          poses.set(motion.key, motion.sample(t));
          if (t === 1) { this.motions.delete(motion.key); completed.push(motion); }
        }
        this.paint(poses);
        for (const motion of completed) {
          if (this.disposed || this.paused) break;
          if (this.generations.get(motion.key) === motion.generation) motion.complete();
        }
      } catch (error) { this.dispose(); this.fail(error); return; }
      this.ensureFrame();
    });
  }
}

