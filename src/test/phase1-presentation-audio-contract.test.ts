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
    expect(deal).toContain('if (stage !== "remaining") playGameSound("shuffle"');
  });

  it("skips historical deal replay and clears presentation on reconnect/interruption", () => {
    expect(deal).toContain("if (firstRender.current || previousGameId.current !== projection.gameId)");
    expect(deal).toContain("for (const timer of timers.current) window.clearTimeout(timer)");
    expect(deal).toContain('window.addEventListener("orientationchange", interrupt)');
    expect(deal).toContain('document.addEventListener("visibilitychange", visibility)');
  });

  it("animates deal backs and accepted cards from measured origin toward viewer-relative destinations", () => {
    expect(deal).toContain("window.requestAnimationFrame(() => setArrived(true))");
    expect(deal).toContain("geometry.seatOrigins[pos]");
    expect(trick).toContain("geometry?.seatOrigins[pos]");
    expect(trick).toContain("geometry.trickSlots[pos]");
    expect(trick).toContain("window.requestAnimationFrame(() => setArrived(true))");
  });

  it("derives departing trick winner only from authoritative completedTricks", () => {
    expect(trick).toContain("projection.cards.completedTricks[completedCount - 1]");
    expect(trick).toContain("winnerSeat: trick.winnerSeat");
    expect(trick).not.toMatch(/resolveTrick|calculateWinner/);
    expect(trick).toContain("winnerSeat === play.seatIndex");
    expect(trick).toContain("setDeparting");
    expect(trick).toContain("setDeparting((value) => value?.id === id ? null : value)");
  });

  it("uses stable accepted-play event identities so polling jumps cannot duplicate play audio", () => {
    expect(trick).toContain("function acceptedPlayEventId");
    expect(trick).toContain("for (const play of trick.cards)");
    expect(trick).toContain("for (const play of projection.cards.currentTrick)");
    expect(trick).toContain('playGameSound("play", acceptedPlayEventId');
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

  it("integrates the measured presentation layers without changing gameplay command semantics", () => {
    expect(table).toContain("<TrickPresentation");
    expect(table).toContain("geometry={tableGeometry.geometry}");
    expect(table).toContain("<DealPresentation projection={projection} geometry={tableGeometry.geometry} />");
    expect(table).toContain('await onCommand({ type: "play_card", cardId })');
  });
});
