import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps the waiting-room overlay from intercepting host controls", () => {
  const page = readFileSync("src/routes/table.tsx", "utf8");
  expect(page).toContain('className="pointer-events-none absolute inset-0 z-[95]');
  expect(page).toContain('(busy && projection.lifecycle !== "starting")');
});

it("permits ending a starting game even when gameplay is blocked", () => {
  const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
  expect(table).toContain('disabled={(busy && projection.lifecycle !== "starting") || projection.lifecycle === "complete"}');
});
