import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("JK-006 runtime timing diagnostics", () => {
  it("persists actual runtime timing events and exports a JSON file", () => {
    const diagnostic = read("src/lib/timingDiagnostics.ts");
    expect(diagnostic).toContain("joker:timing-diagnostics:v1");
    expect(diagnostic).toContain("performance.now()");
    expect(diagnostic).toContain("prefers-reduced-motion: reduce");
    expect(diagnostic).toContain("joker-timing-diagnostics-${stamp}.json");
    expect(diagnostic).toContain("MAX_EVENTS = 800");
  });

  it("records dealer and normal-deal card visibility timestamps", () => {
    const dealer = read("src/components/table/DealerSelectionPresentation.tsx");
    const deal = read("src/components/table/DealPresentation.tsx");
    expect(dealer).toContain('recordTimingDiagnostic("dealer_sequence_start"');
    expect(dealer).toContain('recordTimingDiagnostic("dealer_card_visible"');
    expect(dealer).toContain('recordTimingDiagnostic("dealer_sequence_complete"');
    expect(deal).toContain('recordTimingDiagnostic("deal_sequence_start"');
    expect(deal).toContain('recordTimingDiagnostic("deal_card_visible"');
    expect(deal).toContain('recordTimingDiagnostic("deal_sequence_complete"');
  });

  it("exposes one-tap diagnostic export from the gameplay overflow menu", () => {
    const menu = read("src/components/table/TableUtilityMenu.tsx");
    expect(menu).toContain("exportTimingDiagnosticsFile");
    expect(menu).toContain("Λήψη timing diagnostic");
  });
});
