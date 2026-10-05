import { describe, expect, it } from "vitest";
import {
  NORMAL_DEAL_STAGGER_MS,
  NORMAL_DEAL_TRAVEL_MS,
  dealPresentationTiming,
} from "@/components/table/dealPresentationModel";

describe("JK-004/JK-006 deal presentation cadence", () => {
  it("keeps deal beats at the fixed readable baseline", () => {
    expect(NORMAL_DEAL_STAGGER_MS).toBe(500);
    expect(NORMAL_DEAL_TRAVEL_MS).toBe(440);
    expect(dealPresentationTiming(false).staggerMs).toBe(NORMAL_DEAL_STAGGER_MS);
  });

  it("does not let browser reduced-motion accelerate gameplay dealing", () => {
    expect(dealPresentationTiming(true)).toEqual(dealPresentationTiming(false));
  });
});
