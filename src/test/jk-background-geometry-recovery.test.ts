import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("foreground table geometry recovery", () => {
  it("remeasures on mobile foreground, page restore and visual viewport changes", () => {
    const geometry = source("src/components/table/useTableGeometry.ts");
    expect(geometry).toContain('document.addEventListener("visibilitychange", onForeground)');
    expect(geometry).toContain('window.addEventListener("pageshow", onForeground)');
    expect(geometry).toContain('window.visualViewport?.addEventListener("resize", scheduleMeasure)');
    expect(geometry).toContain('if (bounds.width < 100 || bounds.height < 100');
    expect(geometry).toContain('document.removeEventListener("visibilitychange", onForeground)');
  });
  it("does not reuse stale coordinates for hydrated trick cards", () => {
    const trick = source("src/components/table/TrickPresentation.tsx");
    expect(trick).toContain("active?.hydrated && !departing && !localPlayPresentation");
    expect(trick).toContain("geometry ?? trickGeometry.current.get(geometryKey)");
  });
  it("continues using authoritative foreground sync without relying on background Javascript", () => {
    const route = source("src/routes/table.tsx");
    expect(route).toContain("returnSync.begin()");
    expect(route).toContain("refreshForeground()");
    expect(route).toContain("setTableEpoch((value) => value + 1)");
  });
});
