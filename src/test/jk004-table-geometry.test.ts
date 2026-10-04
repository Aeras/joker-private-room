import { describe, expect, it } from "vitest";
import { computeTableGeometry, type RectLike } from "@/components/table/useTableGeometry";

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe("JK-004 measured table geometry", () => {
  it("centers the usable felt between measured seats rather than raw viewport center", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(50, 80, 900, 500),
      topSeatRect: rect(420, 90, 160, 70),
      leftSeatRect: rect(60, 260, 120, 100),
      rightSeatRect: rect(820, 260, 120, 100),
      localSeatRect: rect(420, 610, 160, 70),
      viewportWidth: 1000,
    });

    expect(geometry.usableCenter.x).toBeCloseTo(450, 0);
    expect(geometry.usableCenter.y).toBeGreaterThan(250);
    expect(geometry.usableCenter.y).toBeLessThan(330);
    expect(geometry.usableBounds.left).toBeGreaterThan(0);
    expect(geometry.usableBounds.right).toBeLessThan(900);
  });

  it("keeps four trick slots compact around the shared usable center", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(0, 0, 900, 500),
      viewportWidth: 1000,
    });

    expect(geometry.trickSlots[0].x).toBe(geometry.usableCenter.x);
    expect(geometry.trickSlots[2].x).toBe(geometry.usableCenter.x);
    expect(geometry.trickSlots[1].y).toBe(geometry.usableCenter.y);
    expect(geometry.trickSlots[3].y).toBe(geometry.usableCenter.y);
    expect(geometry.trickSlots[1].x).toBeLessThan(geometry.usableCenter.x);
    expect(geometry.trickSlots[3].x).toBeGreaterThan(geometry.usableCenter.x);
  });

  it("derives real measured seat origins in felt-local coordinates", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(100, 50, 800, 400),
      topSeatRect: rect(430, 70, 140, 60),
      leftSeatRect: rect(120, 190, 100, 80),
      rightSeatRect: rect(780, 190, 100, 80),
      localSeatRect: rect(430, 480, 140, 60),
      viewportWidth: 900,
    });

    expect(geometry.seatOrigins[2]).toEqual({ x: 400, y: 50 });
    expect(geometry.seatOrigins[1]).toEqual({ x: 70, y: 180 });
    expect(geometry.seatOrigins[3]).toEqual({ x: 730, y: 180 });
    expect(geometry.seatOrigins[0]).toEqual({ x: 400, y: 460 });
  });
});
