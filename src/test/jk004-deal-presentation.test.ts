import { describe, expect, it } from "vitest";
import {
  NORMAL_DEAL_STAGGER_MS,
  REDUCED_DEAL_STAGGER_MS,
  dealPresentationTiming,
} from "@/components/table/dealPresentationModel";

describe("JK-004/JK-006 deal presentation cadence", () => {
  it("keeps normal deal beats at the JK-006 readable baseline", () => {
    expect(NORMAL_DEAL_STAGGER_MS).toBeGreaterThanOrEqual(330);
    expect(NORMAL_DEAL_STAGGER_MS).toBeLessThanOrEqual(370);
    expect(dealPresentationTiming(false).staggerMs).toBe(NORMAL_DEAL_STAGGER_MS);
  });

  it("keeps reduced motion shorter without collapsing to zero", () => {
    expect(REDUCED_DEAL_STAGGER_MS).toBeGreaterThan(0);
    expect(REDUCED_DEAL_STAGGER_MS).toBeLessThan(NORMAL_DEAL_STAGGER_MS);
  });
});
