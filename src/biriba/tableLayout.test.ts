import { describe, expect, it } from "vitest";
import { opponentFanPose } from "./tableLayout";

describe("Biriba opponent fans", () => {
  it("keeps the teammate centered and gives the backs a shallow arc", () => {
    const left = opponentFanPose("top", 0, 11);
    const middle = opponentFanPose("top", 5, 11);
    const right = opponentFanPose("top", 10, 11);
    expect(middle.x).toBe(640);
    expect(left.x).toBeLessThan(middle.x);
    expect(right.x).toBeGreaterThan(middle.x);
    expect(left.y).toBeGreaterThan(middle.y);
    expect(left.angle).toBe(-right.angle);
  });

  it("curves both side hands along mirrored table edges", () => {
    for (const count of [3, 7, 14]) {
      const firstLeft = opponentFanPose("left", 0, count);
      const middleLeft = opponentFanPose("left", (count - 1) / 2, count);
      const lastLeft = opponentFanPose("left", count - 1, count);
      expect(firstLeft.y).toBeLessThan(middleLeft.y);
      expect(middleLeft.y).toBeLessThan(lastLeft.y);
      expect(firstLeft.x).toBeGreaterThan(middleLeft.x);
      expect(lastLeft.x).toBeGreaterThan(middleLeft.x);

      for (let index = 0; index < count; index++) {
        const left = opponentFanPose("left", index, count);
        const right = opponentFanPose("right", index, count);
        expect(left.x + right.x).toBe(1280);
        expect(left.y).toBe(right.y);
        expect(left.angle).toBe(-right.angle);
        expect(left.x).toBeGreaterThan(40);
        expect(right.x).toBeLessThan(1240);
      }
    }
  });
});
