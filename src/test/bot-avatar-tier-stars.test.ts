import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");

describe("bot avatar tier stars", () => {
  it("uses the seated bot's immutable strategy identity, not the name or avatar", () => {
    expect(seat).toContain('o.bot.strategyProfileId === "strong-basic-v1" ? 1');
    expect(seat).toContain('o.bot.strategyProfileId === "memory-inference-v1" ? 2');
    expect(seat).toContain('o.bot.strategyProfileId === "probability-simulation-v1" ? 3');
  });
  it("keeps stars inside a clipped circular footer without changing names or scores", () => {
    expect(seat).toContain("data-bot-tier={botTier}");
    expect(seat).toContain('overflow-hidden rounded-full');
    expect(seat).toContain('bg-[rgba(0,53,28,0.60)]');
    expect(seat).toContain('h-[27%]');
    expect(seat).toContain('Array.from({ length: botTier }');
    expect(seat).toContain("<SeatSummary seat={seat} stats={stats} />");
  });
});
