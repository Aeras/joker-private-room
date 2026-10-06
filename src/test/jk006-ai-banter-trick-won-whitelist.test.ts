import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const edge = readFileSync("supabase/functions/ai-banter/index.ts", "utf8");
const core = readFileSync("supabase/functions/_shared/dialogue-core.ts", "utf8");

describe("TRICK_WON ai-banter wiring", () => {
  it("keeps the public event type and edge whitelist in sync", () => {
    expect(core).toContain('| "TRICK_WON"');
    expect(edge).toContain('"TRICK_WON"');
  });
});
