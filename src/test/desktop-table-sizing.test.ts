import { describe, expect, it } from "vitest";
import { desktopTableScale } from "@/components/table/desktopTableSizing";
import { computeTableGeometry } from "@/components/table/useTableGeometry";

const input = (width: number, height: number, desktopPointer: boolean) => ({
  viewportWidth: width, viewportHeight: height, desktopPointer,
  feltRect: { left: 0, top: 0, right: width, bottom: height * .63, width, height: height * .63 },
});
describe("isolated desktop table sizing", () => {
  it.each([[780,360], [900,420], [1032,480], [1440,900], [2560,1440]])(
    "preserves touch geometry at %ix%i", (width,height) => {
      expect(desktopTableScale(width,height,false)).toBe(1);
      const touch = computeTableGeometry(input(width,height,false));
      const { desktopPointer: _pointer, ...legacyInput } = input(width,height,false);
      const legacy = computeTableGeometry(legacyInput);
      expect(touch).toEqual(legacy);
    });
  it.each([[1199,900], [1920,649]])("keeps small computer windows unchanged at %ix%i", (width,height) => {
    expect(desktopTableScale(width,height,true)).toBe(1);
  });
  it.each([[1440,900,1.2], [1920,1080,1.6], [2560,1440,2560/1200], [3840,2160,2.25]])(
    "scales desktop seats and card coordinates together at %ix%i", (width,height,scale) => {
      expect(desktopTableScale(width,height,true)).toBeCloseTo(scale);
      const geometry=computeTableGeometry(input(width,height,true));
      expect(geometry.trickCardSize.width).toBeCloseTo(135*scale);
      expect(geometry.trickSlots[3].x-geometry.usableCenter.x).toBeCloseTo(135*scale*.62);
      expect(geometry.localDealExit?.y).toBe(height);
    });
  it("retains the measured usable-height cap with large avatars", () => {
    const geometry=computeTableGeometry({ ...input(1920,1080,true), feltRect:{left:0,top:0,right:1920,bottom:100,width:1920,height:100} });
    expect(geometry.trickCardSize.width).toBeCloseTo(100/2.55);
  });
});
