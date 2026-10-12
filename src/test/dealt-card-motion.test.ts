import { describe, expect, it } from "vitest";
import { dealtCardPose, dealtCardFrames } from "@/components/table/dealtCardMotion";

describe("restrained dealt-card motion", () => {
  it.each([{ x: 0, y: 400 }, { x: -600, y: 0 }, { x: 0, y: -400 }, { x: 600, y: 0 }])("keeps exact endpoints toward %j", (end) => {
    const start = { x: 20, y: 30 };
    expect(dealtCardPose(start, end, 90, -90, 0)).toEqual({ point: start, rotation: 90, scale: 0.9 });
    expect(dealtCardPose(start, end, 90, -90, 1)).toEqual({ point: end, rotation: -90, scale: 1 });
    for (let t = 0.05; t < 1; t += 0.05) {
      const pose = dealtCardPose(start, end, 90, -90, t);
      const deviation = Math.hypot(pose.point.x - (start.x + (end.x - start.x) * t), pose.point.y - (start.y + (end.y - start.y) * t));
      expect(deviation).toBeLessThanOrEqual(16.00001);
      expect(pose.scale).toBeGreaterThanOrEqual(0.9);
      expect(pose.scale).toBeLessThanOrEqual(1);
      expect(Math.abs(pose.rotation - (90 - 180 * t))).toBeLessThanOrEqual(3.00001);
    }
  });
  it("does not move or flourish when the measured positions coincide", () => {
    expect(dealtCardPose({ x: 5, y: 6 }, { x: 5, y: 6 }, 0, 0, 0.5)).toMatchObject({ point: { x: 5, y: 6 }, rotation: 0 });
  });
  it("emits a finite CSS sequence with the exact final transform", () => {
    const frames = dealtCardFrames({ x: 10, y: 20 }, { x: 110, y: 220 }, 90, 180);
    expect(frames.match(/%\{/g)).toHaveLength(21);
    expect(frames).toContain("100%{transform:translate(calc(-50% + 100px),calc(-50% + 200px)) scale(1) rotate(180deg)}");
    expect(frames).not.toMatch(/NaN|Infinity/);
  });
});
