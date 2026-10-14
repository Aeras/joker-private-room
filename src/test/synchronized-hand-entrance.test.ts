import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const timing = readFileSync("src/components/table/presentationTiming.ts", "utf8");
const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");
const hand = readFileSync("src/components/table/LocalHandRow.tsx", "utf8");
const card = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");

describe("synchronized hand-entrance presentation", () => {
  it("uses 800ms hand rise and 450ms flip for Canvas and DOM", () => {
    expect(timing).toContain("LOCAL_HAND_ENTRANCE_MS = 800");
    expect(timing).toContain("LOCAL_HAND_FLIP_MS = 450");
    expect(hand).toContain("reduced?75:LOCAL_HAND_FLIP_MS");
    expect(card).toContain("${LOCAL_HAND_FLIP_MS}ms");
    expect(table).toContain("HAND_REVEAL_MS = 950");
  });

  it("shows opponent hands with the local reveal instead of after it", () => {
    expect(table).toContain("const remoteHandsRevealed = handRevealActive || revealedHands.current.has(");
    expect(table).toContain('showCards={remoteHandsRevealed || (!startupPresentationActive');
    expect(table).toContain("entrance={handRevealActive}");
    expect(table).toContain("startupPresentationActive && !handRevealActive ? 0 : publicRemainingCardCount");
    expect(seat).toContain('data-hand-entrance={entrance ? "true" : undefined}');
  });

  it("slides opponents from left, top and right, while respecting reduced motion", () => {
    expect(styles).toContain('--remote-entry-x:-110vw');
    expect(styles).toContain('--remote-entry-y:-110vh');
    expect(styles).toContain('--remote-entry-x:110vw');
    expect(styles).toContain('joker-remote-hand-enter 800ms');
    expect(styles).toContain('@media(prefers-reduced-motion:reduce)');
  });
});
