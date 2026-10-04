import { describe, expect, it } from "vitest";
import {
  NORMAL_DEAL_STAGGER_MS,
  REDUCED_DEAL_STAGGER_MS,
  dealPresentationTiming,
} from "@/components/table/dealPresentationModel";

describe("JK-004 deal presentation cadence", () => {
  it("keeps normal deal beats inside the locked human-readable target", () => {
    expect(NORMAL_DEAL_STAGGER_MS).toBeGreaterThanOrEqual(110);
    expect(NORMAL_DEAL_STAGGER_MS).toBeLessThanOrEqual(160);
    expect(dealPresentationTiming(false).staggerMs).toBe(NORMAL_DEAL_STAGGER_MS);
  });

  it("keeps reduced motion shorter without collapsing to zero", () => {
    expect(REDUCED_DEAL_STAGGER_MS).toBeGreaterThan(0);
    expect(REDUCED_DEAL_STAGGER_MS).toBeLessThan(NORMAL_DEAL_STAGGER_MS);
  });
});
