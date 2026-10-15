import { describe, expect, it } from "vitest";
import { localHandCardPresentation } from "./localHandPresentation";

describe("Biriba local hand selection", () => {
  it("raises only the selected card without changing its overlap order", () => {
    for (const count of [2, 11, 22]) {
      for (let index = 0; index < count; index++) {
        const settled = localHandCardPresentation(index, count, false);
        const raised = localHandCardPresentation(index, count, true);
        expect(raised.zIndex).toBe(settled.zIndex);
        expect(raised.zIndex).toBe(index + 1);
        expect(raised.transform).toContain("clamp(45px, 11.5vh, 100px)");
        expect(settled.transform).not.toContain("clamp(45px, 11.5vh, 100px)");
      }
    }
  });
});
