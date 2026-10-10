import { describe, expect, it } from "vitest";
import { computeTableGeometry, type RectLike } from "@/components/table/useTableGeometry";

function rect(left: number, top: number, width: number, height: number): RectLike {
  return { left, top, width, height, right: left + width, bottom: top + height };
}

describe("JK-004 measured table geometry", () => {
  it.each([[780,360], [800,400], [568,320], [1000,600]])("places the deal exit at the visible screen edge for %i x %i", (width,height) => {
    const felt = rect(width * .05, height * .1, width * .9, height * .63);
    const geometry = computeTableGeometry({feltRect:felt, viewportWidth:width, viewportHeight:height});
    expect(geometry.localDealExit).toBeDefined();
    expect(geometry.localDealExit!.y + felt.top).toBe(height);
    expect(geometry.localDealExit!.y - geometry.dealTargets[0].y).toBeCloseTo(height * .28);
    expect(geometry.localHandCenter.y + felt.top).toBeCloseTo(height * .73);
    expect(geometry.localDealExit!.x).toBe(geometry.dealTargets[0].x);
    const exits=geometry.dealExitTargets!;
    expect(exits[0].x).toBe(geometry.dealTargets[0].x);
    expect(exits[2].x).toBe(geometry.dealTargets[2].x);
    expect(exits[1].y).toBe(geometry.dealTargets[1].y);
    expect(exits[3].y).toBe(geometry.dealTargets[3].y);
    expect(exits[1].x+felt.left).toBe(0);
    expect(exits[2].y+felt.top).toBe(0);
    expect(exits[3].x+felt.left).toBe(width);
  });
  it("centers the usable felt between measured seats rather than raw viewport center", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(50, 80, 900, 500),
      topSeatRect: rect(420, 90, 160, 70),
      leftSeatRect: rect(60, 260, 120, 100),
      rightSeatRect: rect(820, 260, 120, 100),
      localSeatRect: rect(420, 610, 160, 70),
      viewportWidth: 1000,
      viewportHeight: 700,
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
      viewportHeight: 700,
    });

    expect(geometry.trickSlots[0].x).toBe(geometry.usableCenter.x);
    expect(geometry.trickSlots[2].x).toBe(geometry.usableCenter.x);
    expect(geometry.trickSlots[1].y).toBe(geometry.usableCenter.y);
    expect(geometry.trickSlots[3].y).toBe(geometry.usableCenter.y);
    expect(geometry.trickSlots[1].x).toBeLessThan(geometry.usableCenter.x);
    expect(geometry.trickSlots[3].x).toBeGreaterThan(geometry.usableCenter.x);
  });

  it("keeps slightly smaller trick cards and proportional slot spacing while retaining the short-height cap", () => {
    const large = computeTableGeometry({ feltRect: rect(0, 0, 1400, 650), viewportWidth: 1600, viewportHeight: 900 });
    expect(large.trickCardSize.width).toBe(128.25);
    expect(large.trickSlots[3].x - large.usableCenter.x).toBeCloseTo(128.25 * 0.62);
    expect(large.trickSlots[0].y - large.usableCenter.y).toBeCloseTo(128.25 * 1.4 * 0.42);
    const medium = computeTableGeometry({ feltRect: rect(0, 0, 1000, 500), viewportWidth: 1000, viewportHeight: 700 });
    expect(medium.trickCardSize.width).toBeCloseTo(100.9375);
    const small = computeTableGeometry({ feltRect: rect(0, 0, 500, 500), viewportWidth: 500, viewportHeight: 700 });
    expect(small.trickCardSize.width).toBe(66.5);
    const short = computeTableGeometry({ feltRect: rect(0, 0, 720, 100), viewportWidth: 800, viewportHeight: 240 });
    expect(short.trickCardSize.width).toBeLessThan(40);
    expect(short.trickCardSize.height).toBeLessThan(100);
  });

  it("derives real measured seat origins in felt-local coordinates", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(100, 50, 800, 400),
      topSeatRect: rect(430, 70, 140, 60),
      leftSeatRect: rect(120, 190, 100, 80),
      rightSeatRect: rect(780, 190, 100, 80),
      localSeatRect: rect(430, 480, 140, 60),
      viewportWidth: 900,
      viewportHeight: 600,
    });

    expect(geometry.seatOrigins[2]).toEqual({ x: 400, y: 50 });
    expect(geometry.seatOrigins[1]).toEqual({ x: 70, y: 180 });
    expect(geometry.seatOrigins[3]).toEqual({ x: 730, y: 180 });
    expect(geometry.seatOrigins[0]).toEqual({ x: 400, y: 460 });
  });

  it("anchors dealing to the visible viewport cross rather than the shortened felt container", () => {
    const geometry = computeTableGeometry({
      feltRect: rect(50, 70, 900, 440),
      topSeatRect: rect(430, 80, 140, 60),
      leftSeatRect: rect(60, 230, 100, 80),
      rightSeatRect: rect(840, 230, 100, 80),
      localSeatRect: rect(430, 560, 140, 60),
      viewportWidth: 1000,
      viewportHeight: 700,
    });

    // Viewport center (500,350) converted into felt-local coordinates.
    expect(geometry.dealCenter).toEqual({ x: 450, y: 280 });

    // 24% / 50% / 76% horizontally and 28% / 50% / 72% vertically in viewport space.
    expect(geometry.dealTargets[1]).toEqual({ x: 190, y: 280 });
    expect(geometry.dealTargets[3]).toEqual({ x: 710, y: 280 });
    expect(geometry.dealTargets[2]).toEqual({ x: 450, y: 126 });
    expect(geometry.dealTargets[0]).toEqual({ x: 450, y: 434 });
  });
});

