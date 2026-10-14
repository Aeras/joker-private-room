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

  it("fans the side hands vertically without crossing into the meld zones", () => {
    for (const side of ["left", "right"] as const) {
      const first = opponentFanPose(side, 0, 14);
      const last = opponentFanPose(side, 13, 14);
      expect(first.y).toBeLessThan(last.y);
      expect(first.x).toBeGreaterThan(35);
      expect(last.x).toBeLessThan(1245);
    }
  });
});
