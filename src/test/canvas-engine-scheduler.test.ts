import { describe, expect, it, vi } from "vitest";
import { MotionScheduler } from "@/components/table/canvas/scheduler";
import { CardCanvasEngine } from "@/components/table/canvas/engine";
import type { FrameDriver, SpritePose } from "@/components/table/canvas/types";
function frames() {
  let time = 0,
    id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  const driver: FrameDriver = {
    now: () => time,
    request: (cb) => {
      pending.set(++id, cb);
      return id;
    },
    cancel: (key) => {
      pending.delete(key);
    },
  };
  return {
    driver,
    pending,
    tick: (t: number) => {
      time = t;
      const callbacks = [...pending.values()];
      pending.clear();
      callbacks.forEach((cb) => cb(t));
    },
  };
}
const pose = (t = 0): SpritePose => ({
  x: t * 100,
  y: 50,
  width: 60,
  height: 84,
  rotation: 0,
  opacity: 1,
  flip: 0,
});
describe("Canvas elapsed-time scheduler", () => {
  it("samples actual elapsed time, finishes once and stops its idle loop", () => {
    const f = frames(),
      draw = vi.fn(),
      done = vi.fn(),
      fail = vi.fn();
    const clock = new MotionScheduler(f.driver, draw, fail);
    clock.animate("a", 300, pose, done);
    f.tick(75);
    expect(draw.mock.calls[0]![0].get("a").x).toBe(25);
    f.tick(800);
    expect(done).toHaveBeenCalledOnce();
    expect(f.pending.size).toBe(0);
    f.tick(1000);
    expect(done).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();
  });
  it("invalidates even a queued frame delivered after dispose", () => {
    const f = frames(),
      draw = vi.fn(),
      done = vi.fn();
    const clock = new MotionScheduler(f.driver, draw, vi.fn());
    clock.animate("a", 100, pose, done);
    const queued = [...f.pending.values()][0]!;
    clock.dispose();
    queued(500);
    expect(draw).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    expect(f.pending.size).toBe(0);
  });
  it("suspends while hidden and settles elapsed work when foregrounded", () => {
    const f = frames(),
      draw = vi.fn(),
      done = vi.fn();
    const clock = new MotionScheduler(f.driver, draw, vi.fn());
    clock.animate("a", 300, pose, done);
    f.tick(80);
    const old = [...f.pending.values()][0]!;
    clock.suspend();
    old(1000);
    expect(done).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
    f.tick(2000);
    clock.resume();
    f.tick(2016);
    expect(done).toHaveBeenCalledOnce();
    expect(draw.mock.calls.at(-1)![0].get("a").x).toBe(100);
  });
  it("cancels an earlier generation when returning/replacing a card", () => {
    const f = frames(),
      first = vi.fn(),
      second = vi.fn();
    const clock = new MotionScheduler(f.driver, vi.fn(), vi.fn());
    clock.animate("a", 300, pose, first);
    f.tick(100);
    clock.animate("a", 120, (t) => pose(1 - t), second);
    f.tick(250);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
  it("contains rendering failures without leaving a live loop", () => {
    const f = frames(),
      fail = vi.fn(),
      done = vi.fn();
    const clock = new MotionScheduler(
      f.driver,
      () => {
        throw Error("context lost");
      },
      fail,
    );
    clock.animate("a", 100, pose, done);
    f.tick(100);
    expect(fail).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(f.pending.size).toBe(0);
  });
  it("bounds simultaneous animations and rejects invalid timing", () => {
    const f = frames(),
      clock = new MotionScheduler(f.driver, vi.fn(), vi.fn());
    expect(() => clock.animate("bad", NaN, pose, vi.fn())).toThrow();
    for (let i = 0; i < 32; i++) clock.animate(String(i), 300, pose, vi.fn());
    expect(() => clock.animate("overflow", 300, pose, vi.fn())).toThrow();
    clock.dispose();
  });
});
describe("Canvas card layer", () => {
  function context() {
    return Object.fromEntries(
      [
        "setTransform",
        "clearRect",
        "save",
        "restore",
        "translate",
        "rotate",
        "scale",
        "beginPath",
        "moveTo",
        "lineTo",
        "quadraticCurveTo",
        "closePath",
        "fill",
        "clip",
        "drawImage",
      ].map((name) => [name, vi.fn()]),
    ) as unknown as CanvasRenderingContext2D;
  }
  it("caps DPR, preserves CSS coordinates, layering and explicit backs", () => {
    const canvas = document.createElement("canvas"),
      ctx = context(),
      f = frames();
    const engine = new CardCanvasEngine(canvas, ctx, vi.fn(), f.driver);
    engine.resize(844, 390, 3);
    expect(canvas.width).toBe(1688);
    expect(canvas.height).toBe(780);
    const front = {} as CanvasImageSource,
      back = {} as CanvasImageSource;
    engine.set({
      id: "top",
      image: front,
      backImage: back,
      pose: { ...pose(), flip: 180 },
      layer: 2,
    });
    engine.set({ id: "bottom", image: front, pose: pose(), layer: 1 });
    expect(vi.mocked(ctx.drawImage).mock.calls.at(-1)![0]).toBe(back);
    engine.animate("bottom", 300, pose, vi.fn());
    f.tick(300);
    expect(engine.pose("bottom")?.x).toBe(100);
    engine.resize(4000, 3000, 3);
    expect(canvas.width * canvas.height).toBeLessThan(4_010_000);
    engine.dispose();
    expect(f.pending.size).toBe(0);
  });
  it("rejects non-finite poses and excess sprites", () => {
    const engine = new CardCanvasEngine(
      document.createElement("canvas"),
      context(),
      vi.fn(),
      frames().driver,
    );
    expect(() =>
      engine.set({
        id: "bad",
        image: {} as CanvasImageSource,
        pose: { ...pose(), x: NaN },
        layer: 0,
      }),
    ).toThrow();
    for (let i = 0; i < 64; i++)
      engine.set({ id: String(i), image: {} as CanvasImageSource, pose: pose(), layer: i });
    expect(() =>
      engine.set({ id: "overflow", image: {} as CanvasImageSource, pose: pose(), layer: 0 }),
    ).toThrow();
    engine.dispose();
  });
});
