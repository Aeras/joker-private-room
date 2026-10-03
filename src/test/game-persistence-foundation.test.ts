import { describe, expect, it } from "vitest";

import { fingerprintJson, stableJson } from "@/lib/stableFingerprint";

describe("stable game command fingerprint", () => {
  it("normalizes object key order recursively", async () => {
    const first = { gameId: "g", payload: { z: 2, a: { y: 4, b: 3 } }, expectedStateVersion: 7 };
    const second = { expectedStateVersion: 7, payload: { a: { b: 3, y: 4 }, z: 2 }, gameId: "g" };

    expect(stableJson(first)).toBe(stableJson(second));
    expect(await fingerprintJson(first)).toBe(await fingerprintJson(second));
    expect(await fingerprintJson(first)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when the bound payload changes", async () => {
    const first = await fingerprintJson({ action: "play", payload: { cardId: "7-hearts" } });
    const second = await fingerprintJson({ action: "play", payload: { cardId: "8-hearts" } });
    expect(first).not.toBe(second);
  });
});
