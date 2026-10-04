import { describe, expect, it } from "vitest";
import {
  declarationAccessibleLabel,
  declarationDisplayValue,
  localHandCenterOffset,
} from "@/components/table/tableControlModel";
import type { TableGeometry } from "@/components/table/useTableGeometry";

describe("JK-004 hand and declaration presentation", () => {
  it("renders canonical declaration zero as pass without changing its numeric value", () => {
    expect(declarationDisplayValue(0)).toBe("—");
    expect(declarationAccessibleLabel(0)).toBe("Πάσο / δήλωση μηδέν");
    expect(declarationDisplayValue(4)).toBe("4");
  });

  it("centers the hand on measured usable lane rather than avatar padding", () => {
    const geometry = {
      feltRect: { left: 50, top: 50, right: 950, bottom: 550, width: 900, height: 500 },
      localHandCenter: { x: 470, y: 500 },
    } as TableGeometry;
    expect(localHandCenterOffset(geometry)).toBe(20);
    expect(localHandCenterOffset(null)).toBe(0);
  });
});
