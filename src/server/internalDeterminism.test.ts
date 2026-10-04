import { describe, expect, it } from "vitest";

import {
  deterministicRandomUnits,
  stableInternalActionId,
} from "./internalDeterminism";

describe("stable internal dealer-bootstrap determinism", () => {
  it("derives stable UUID identities without client input", async () => {
    const gameId = "00000000-0000-4000-8000-000000000099";
    const first = await stableInternalActionId(gameId, "initial-dealer-bootstrap-v1");
    const second = await stableInternalActionId(gameId, "initial-dealer-bootstrap-v1");
    const other = await stableInternalActionId(gameId, "canonical-bootstrap-init-v1");
    expect(first).toBe(second);
    expect(first).not.toBe(other);
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("uses stable but independent random streams per transition label", async () => {
    const gameId = "00000000-0000-4000-8000-000000000099";
    const selectionA = await deterministicRandomUnits(gameId, "dealer-selection-shuffle-v1", 35);
    const selectionB = await deterministicRandomUnits(gameId, "dealer-selection-shuffle-v1", 35);
    const dealOne = await deterministicRandomUnits(gameId, "deal-one-shuffle-v1", 35);
    expect(selectionA).toEqual(selectionB);
    expect(selectionA).not.toEqual(dealOne);
    expect(selectionA.every((value) => value >= 0 && value < 1)).toBe(true);
  });
});
