import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const deal = readFileSync("src/components/table/DealPresentation.tsx", "utf8");
const trick = readFileSync("src/components/table/TrickPresentation.tsx", "utf8");
const table = readFileSync("src/components/table/GameTable.tsx", "utf8");
const audio = readFileSync("src/lib/gameAudio.ts", "utf8");

describe("JK-001 Phase 1 — deal/trick/audio presentation authority", () => {
  it("deals only backs from public deal metadata and never reads private deck/card identities", () => {
    expect(deal).toContain("<PlayingCard faceDown />");
    expect(deal).toContain("nextSeat(dealerSeat)");
    expect(deal).not.toContain("projection.cards.deck");
    expect(deal).not.toContain("ownHand.map");
    expect(deal).not.toContain("card.id");
  });

  it("preserves nine-card privacy with 12 initial and 24 remaining presentation beats", () => {
    expect(deal).toContain('if (stage === "initial") return 12');
    expect(deal).toContain('if (stage === "remaining") return 24');
    expect(deal).toContain('projection.progression.phase === "NINE_CARD_TRUMP_CHOICE"');
    expect(deal).toContain('projection.progression.phase === "DECLARATION"');
  });

  it("skips historical deal replay on first mount/reconnect and bounds one sequence with cleared timers", () => {
    expect(deal).toContain("if (firstRender.current)");
    expect(deal).toContain("return clearTimers");
    expect(deal).toContain("for (const timer of timers.current) window.clearTimeout(timer)");
  });

  it("derives departing trick winner only from authoritative completedTricks", () => {
    expect(trick).toContain("projection.cards.completedTricks[completedCount - 1]");
    expect(trick).toContain("winnerSeat: trick.winnerSeat");
    expect(trick).not.toMatch(/resolveTrick|calculateWinner|winner\s*=/);
    expect(trick).toContain("setDeparting");
    expect(trick).toContain("setDeparting((value) => value?.id === id ? null : value)");
  });

  it("triggers play audio from accepted projection changes, not gesture release", () => {
    expect(trick).toContain('playGameSound("play"');
    expect(table).not.toContain('playGameSound("play"');
    const draggable = readFileSync("src/components/table/DraggableHandCard.tsx", "utf8");
    expect(draggable).not.toContain("playGameSound");
  });

  it("keeps audio bounded, deduplicated and failure-safe", () => {
    expect(audio).toContain("const POOL_SIZE = 4");
    expect(audio).toContain("const MAX_SEEN_EVENTS = 256");
    expect(audio).toContain("if (seen.has(eventId)) return false");
    expect(audio).toContain("void audio.play().catch(() => undefined)");
    expect(audio).not.toContain("throw new Error");
  });

  it("integrates the presentation layers without changing gameplay command semantics", () => {
    expect(table).toContain("<TrickPresentation projection={projection} />");
    expect(table).toContain("<DealPresentation projection={projection} />");
    expect(table).toContain('await onCommand({ type: "play_card", cardId })');
  });
});
