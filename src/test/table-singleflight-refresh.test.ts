import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("table authoritative refresh single-flight", () => {
  it("shares pending refresh across bot polling, command recovery and foreground events", () => {
    const route = readFileSync("src/routes/table.tsx", "utf8");
    expect(route).toContain("const refreshInFlight = useRef<Promise<void> | null>(null)");
    expect(route).toContain("return refreshInFlight.current");
    expect(route).toContain("refreshInFlight.current = guarded");
    expect(route).toContain("if (refreshInFlight.current === guarded)");
    expect(route).toContain('automaticActorPending ? 500 : 1500');
    expect(route).toContain("await refreshAll()");
  });
});
