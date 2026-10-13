import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const seat = readFileSync("src/components/table/TableSeat.tsx", "utf8");
const styles = readFileSync("src/styles.css", "utf8");

describe("opponent hand entrance continuity", () => {
  it("latches the remote hand after entrance, independent of the reveal timer", () => {
    expect(table).toContain(
      "const remoteHandsRevealed = handRevealActive || revealedHands.current.has(",
    );
    expect(table).toContain(
      "cardCount: startupPresentationActive && !remoteHandsRevealed ? 0 : publicRemainingCardCount(projection, seat)",
    );
    expect(table).toContain(
      'showCards={remoteHandsRevealed || (!startupPresentationActive && projection.progression.phase !== "NINE_CARD_TRUMP_CHOICE")}',
    );
    expect(table).toContain("entrance={handRevealActive}");
    expect(table).not.toContain("startupPresentationActive && !handRevealActive ? 0");
  });

  it("retains one stable opponent hand container and three edge entry directions", () => {
    expect(seat).toContain('data-remote-hand={visualSeat}');
    expect(seat).toContain('data-hand-entrance={entrance ? "true" : undefined}');
    expect(styles).toContain("joker-remote-hand-enter 800ms");
    expect(styles).toContain("--remote-entry-x:-110vw");
    expect(styles).toContain("--remote-entry-y:-110vh");
    expect(styles).toContain("--remote-entry-x:110vw");
  });
});
