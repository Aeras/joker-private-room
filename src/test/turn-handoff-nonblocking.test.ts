import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const service = readFileSync("src/services/gameProjectionFunctions.ts", "utf8");
const route = readFileSync("src/routes/table.tsx", "utf8");

describe("nonblocking human-to-bot turn handoff", () => {
  it("acknowledges a committed human card without waiting for bot reconciliation", () => {
    const submit = service.slice(service.indexOf("export const submitProjectedGameplayCommand"), service.indexOf("export const terminateProjectedGame"));
    expect(submit).toContain("submitHumanGameplayCommand");
    expect(submit).toContain("loadCanonicalGameState(data.gameId)");
    expect(submit).not.toContain("settleAutomaticState(data.gameId)");
  });

  it("starts bot reconciliation immediately for a new authoritative actor version", () => {
    expect(route).toContain('if (automaticActorPending && document.visibilityState === "visible") void refreshAll()');
    expect(route).toContain("[automaticActorPending, projection?.stateVersion, refreshAll]");
    expect(route).toContain("if (refreshInFlight.current) return refreshInFlight.current");
    expect(route).toContain("automaticActorPending ? 500 : 1500");
  });
});
