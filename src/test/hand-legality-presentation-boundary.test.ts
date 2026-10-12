import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gameTable = readFileSync("src/components/table/GameTable.tsx", "utf8");
const trickPresentation = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
const localHand = readFileSync("src/components/table/LocalHandRow.tsx", "utf8");

describe("JOKER hand-legality presentation boundary", () => {
  it("hides suit restrictions while a preceding trick card is still presenting", () => {
    expect(gameTable).toContain(
      "legalCardIds={interactionPresentationActive ? [] : playAction?.cardIds ?? []}",
    );
    expect(gameTable).toContain(
      "blocked={interactionPresentationActive || busy || Boolean(submittingCardId) || Boolean(jokerIntent)}",
    );
  });

  it("publishes the presentation busy latch before the browser paints", () => {
    expect(trickPresentation).toContain(
      "useLayoutEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);",
    );
    expect(trickPresentation).not.toContain(
      "useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);",
    );
  });

  it("preserves one shared legality-shading path for both DOM and Canvas hands", () => {
    expect(localHand).toContain("shade:legalCardIds.length>0&&!legal.has(card.id)&&!revealing?");
    expect(localHand).toContain("showLegality={legalCardIds.length > 0}");
  });
});
